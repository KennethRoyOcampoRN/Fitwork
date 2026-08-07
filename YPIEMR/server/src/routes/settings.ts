import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { brandingDir } from "../lib/storage";
import { isAllowedUpload } from "../lib/magicBytes";
import { config } from "../config";
import { DEFAULT_APP_NAME } from "../services/appSettings";

export const settingsRouter = Router();

// Unlike every other router, this one is NOT gated by requireAuth at the
// top — the Login page itself needs the clinic's branding (logo,
// background, colors) before a session exists, so the read endpoints below
// must stay public. Only the write/reset endpoints require ADMIN.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

export const DEFAULT_PRIMARY_COLOR = "#D2571A";
export const DEFAULT_ACCENT_COLOR = "#E4622B";
export { DEFAULT_APP_NAME };
export const DEFAULT_APP_TAGLINE = "by Clinicore — Employee Health Records System";

const SETTINGS_ID = "singleton";

async function getSettings() {
  return prisma.clinicSettings.findUnique({ where: { id: SETTINGS_ID } });
}

function publicShape(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    hasLogo: !!settings?.logoPath,
    hasBackground: !!settings?.backgroundPath,
    primaryColor: settings?.primaryColor || DEFAULT_PRIMARY_COLOR,
    accentColor: settings?.accentColor || DEFAULT_ACCENT_COLOR,
    appName: settings?.appName || DEFAULT_APP_NAME,
    appTagline: settings?.appTagline || DEFAULT_APP_TAGLINE,
    address: settings?.address || null,
    contactNumber: settings?.contactNumber || null,
    certificatePrefix: settings?.certificatePrefix || null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

settingsRouter.get("/branding", async (_req, res) => {
  const settings = await getSettings();
  res.json(publicShape(settings));
});

settingsRouter.get("/branding/logo", async (_req, res) => {
  const settings = await getSettings();
  if (!settings?.logoPath || !fs.existsSync(settings.logoPath)) return res.status(404).json({ error: "No logo set" });
  res.sendFile(settings.logoPath);
});

settingsRouter.get("/branding/background", async (_req, res) => {
  const settings = await getSettings();
  if (!settings?.backgroundPath || !fs.existsSync(settings.backgroundPath)) return res.status(404).json({ error: "No background set" });
  res.sendFile(settings.backgroundPath);
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Must be a hex color like #D2571A");
const brandingSchema = z.object({
  primaryColor: hexColor.optional(),
  accentColor: hexColor.optional(),
  // An empty string (a cleared text input, submitted via FormData) means
  // "reset to default", distinct from the field being absent entirely.
  appName: z.string().max(80).optional(),
  appTagline: z.string().max(120).optional(),
  address: z.string().max(200).optional(),
  contactNumber: z.string().max(60).optional(),
  // Certificate control-number short code. Normalized to uppercase here
  // (not trusted to already be uppercase, even though the client normalizes
  // it too) and validated up front — like every other field in this schema —
  // so a bad value 400s before any file writes happen below. An empty
  // string clears back to "not configured" (falls back to a
  // clinic-name-derived default at certificate-generation time).
  certificatePrefix: z.string().max(10).optional()
    .transform((v) => v?.trim().toUpperCase() ?? v)
    .refine((v) => !v || /^[A-Z0-9]{2,6}$/.test(v), "Certificate short code must be 2-6 letters/digits"),
});

settingsRouter.post(
  "/branding",
  requireAuth,
  requireRole("ADMIN"),
  upload.fields([{ name: "logo", maxCount: 1 }, { name: "background", maxCount: 1 }]),
  async (req, res) => {
    const parsed = brandingSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const logoFile = files?.logo?.[0];
    const backgroundFile = files?.background?.[0];

    if (logoFile && !isAllowedUpload(logoFile.buffer, "png")) {
      return res.status(400).json({ error: "Logo file does not appear to be a valid image" });
    }
    if (backgroundFile && !isAllowedUpload(backgroundFile.buffer, "jpg")) {
      return res.status(400).json({ error: "Background file does not appear to be a valid image" });
    }

    const existing = await getSettings();
    const dir = brandingDir();
    const data: {
      logoPath?: string; backgroundPath?: string; primaryColor?: string; accentColor?: string;
      appName?: string | null; appTagline?: string | null; address?: string | null; contactNumber?: string | null;
      certificatePrefix?: string | null;
    } = {};

    if (logoFile) {
      const logoPath = path.join(dir, `logo-${uuid()}.png`);
      await sharp(logoFile.buffer).resize(400, 400, { fit: "inside", withoutEnlargement: true }).png({ quality: 90 }).toFile(logoPath);
      if (existing?.logoPath) fs.rm(existing.logoPath, { force: true }, () => {});
      data.logoPath = logoPath;
    }
    if (backgroundFile) {
      const backgroundPath = path.join(dir, `background-${uuid()}.jpg`);
      await sharp(backgroundFile.buffer).resize(1920, 1080, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toFile(backgroundPath);
      if (existing?.backgroundPath) fs.rm(existing.backgroundPath, { force: true }, () => {});
      data.backgroundPath = backgroundPath;
    }
    if (parsed.data.primaryColor) data.primaryColor = parsed.data.primaryColor;
    if (parsed.data.accentColor) data.accentColor = parsed.data.accentColor;
    if (parsed.data.appName !== undefined) data.appName = parsed.data.appName.trim() || null;
    if (parsed.data.appTagline !== undefined) data.appTagline = parsed.data.appTagline.trim() || null;
    if (parsed.data.address !== undefined) data.address = parsed.data.address.trim() || null;
    if (parsed.data.contactNumber !== undefined) data.contactNumber = parsed.data.contactNumber.trim() || null;
    if (parsed.data.certificatePrefix !== undefined) data.certificatePrefix = parsed.data.certificatePrefix || null;

    const settings = await prisma.clinicSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });

    await writeAudit({
      req, userId: req.currentUser!.id, action: "UPDATE_BRANDING", entityType: "ClinicSettings", entityId: SETTINGS_ID,
      details: {
        logoUpdated: !!logoFile, backgroundUpdated: !!backgroundFile, primaryColor: data.primaryColor, accentColor: data.accentColor,
        appName: data.appName, appTagline: data.appTagline, address: data.address, contactNumber: data.contactNumber,
        certificatePrefix: data.certificatePrefix,
      },
    });

    res.json(publicShape(settings));
  }
);

settingsRouter.delete("/branding", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const existing = await getSettings();
  if (existing?.logoPath) fs.rm(existing.logoPath, { force: true }, () => {});
  if (existing?.backgroundPath) fs.rm(existing.backgroundPath, { force: true }, () => {});

  const settings = await prisma.clinicSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: { logoPath: null, backgroundPath: null, primaryColor: null, accentColor: null, appName: null, appTagline: null, address: null, contactNumber: null, certificatePrefix: null },
  });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "UPDATE_BRANDING", entityType: "ClinicSettings", entityId: SETTINGS_ID,
    details: { reset: true },
  });

  res.json(publicShape(settings));
});
