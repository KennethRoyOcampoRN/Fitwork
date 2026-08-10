import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { employeeDir } from "../lib/storage";
import { isAllowedUpload } from "../lib/magicBytes";
import { config } from "../config";
import { toCsv } from "../services/csv";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.maxUploadBytes } });

export const CATEGORIES = ["LABORATORY", "IMAGING", "APE", "DENTAL", "MEDICAL_CERTIFICATE", "CLEARANCE", "VACCINATION", "OTHER"] as const;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "xlsx", "xls", "docx"]);
const RESULT_STATUSES = ["NORMAL", "ABNORMAL", "PENDING"] as const;

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  const parsed = z.object({
    employeeId: z.string().uuid(),
    category: z.enum(CATEGORIES),
    labelId: z.string().uuid(),
    documentDate: z.string().optional(),
    notes: z.string().optional(),
    resultStatus: z.enum(RESULT_STATUSES).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  if (!req.file) return res.status(400).json({ error: "No file provided" });

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const label = await prisma.documentLabel.findUnique({ where: { id: parsed.data.labelId } });
  if (!label) return res.status(404).json({ error: "Label not found" });
  if (label.category !== parsed.data.category) return res.status(400).json({ error: "Label does not belong to the selected category" });

  const ext = path.extname(req.file.originalname).replace(".", "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({ error: `File type .${ext} is not accepted` });
  }
  if (!isAllowedUpload(req.file.buffer, ext)) {
    return res.status(400).json({ error: "File content does not match an accepted file type" });
  }

  const dir = employeeDir(employee.employeeCode, parsed.data.category);
  const id = uuid();
  const filePath = path.join(dir, `${id}.${ext}`);
  fs.writeFileSync(filePath, req.file.buffer);

  const doc = await prisma.medicalDocument.create({
    data: {
      employeeId: employee.id,
      category: parsed.data.category,
      title: label.name,
      labelId: label.id,
      documentDate: parsed.data.documentDate ? new Date(parsed.data.documentDate) : null,
      filePath,
      originalFilename: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSizeBytes: req.file.size,
      uploadedById: req.currentUser!.id,
      notes: parsed.data.notes,
      resultStatus: parsed.data.resultStatus,
    },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "UPLOAD_DOC", entityType: "MedicalDocument", entityId: doc.id, employeeId: employee.id, details: { category: doc.category, title: doc.title, resultStatus: doc.resultStatus } });

  res.status(201).json(doc);
});

documentsRouter.get("/", async (req, res) => {
  const { employeeId, category, from, to } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const where: Record<string, unknown> = { employeeId: String(employeeId) };
  if (category) where.category = String(category);
  if (from || to) {
    where.documentDate = {
      ...(from ? { gte: new Date(String(from)) } : {}),
      ...(to ? { lte: new Date(String(to)) } : {}),
    };
  }

  const docs = await prisma.medicalDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { uploadedBy: { select: { fullName: true } }, label: { select: { id: true, name: true } } },
  });
  res.json(docs);
});

// ── Documents left unlabeled by the exact-match auto-migration (typos/
// one-off title variants that had no sibling to link to) — cross-employee,
// so Nurse/Admin can work through the backlog from one list rather than
// hunting per employee. Same role convention as reports.ts's clinic-wide
// tools.
documentsRouter.get("/needs-label", requireRole("NURSE", "ADMIN"), async (_req, res) => {
  const docs = await prisma.medicalDocument.findMany({
    where: { labelId: null },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      uploadedBy: { select: { fullName: true } },
    },
  });
  res.json(docs);
});

// CSV sibling of the above — a handoff-friendly artifact for reviewing the
// backlog offline (e.g. right after upgrading to this version, when the
// exact-match auto-migration has just run against existing documents).
documentsRouter.get("/needs-label/export.csv", requireRole("NURSE", "ADMIN"), async (req, res) => {
  const docs = await prisma.medicalDocument.findMany({
    where: { labelId: null },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      uploadedBy: { select: { fullName: true } },
    },
  });

  const header = ["Employee Code", "Employee Name", "Category", "Title", "Document Date", "Uploaded By", "Uploaded At", "Document ID"];
  const rows = docs.map((d) => [
    d.employee.employeeCode,
    `${d.employee.lastName}, ${d.employee.firstName}`,
    d.category,
    d.title,
    d.documentDate ? d.documentDate.toISOString().slice(0, 10) : "",
    d.uploadedBy.fullName,
    d.createdAt.toISOString().slice(0, 10),
    d.id,
  ]);

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "NeedsLabelReport", details: { rowCount: docs.length } });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="documents-needing-label.csv"`);
  res.send(toCsv(header, rows));
});

const relabelSchema = z.object({ labelId: z.string().uuid() });

documentsRouter.patch("/:id/label", async (req, res) => {
  const parsed = relabelSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const doc = await prisma.medicalDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const label = await prisma.documentLabel.findUnique({ where: { id: parsed.data.labelId } });
  if (!label) return res.status(404).json({ error: "Label not found" });
  if (label.category !== doc.category) return res.status(400).json({ error: "Label does not belong to this document's category" });

  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: { labelId: label.id, title: label.name },
    include: { label: { select: { id: true, name: true } } },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "RELABEL_DOCUMENT", entityType: "MedicalDocument", entityId: doc.id, employeeId: doc.employeeId, details: { before: doc.title, after: label.name } });

  res.json(updated);
});

documentsRouter.get("/:id/file", async (req, res) => {
  const doc = await prisma.medicalDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (!fs.existsSync(doc.filePath)) return res.status(404).json({ error: "File missing from storage" });

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "MedicalDocument", entityId: doc.id, employeeId: doc.employeeId, details: { title: doc.title } });

  res.setHeader("Content-Type", doc.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(doc.originalFilename)}"`);
  res.sendFile(path.resolve(doc.filePath));
});

const archiveSchema = z.object({ reason: z.string().min(1) });

documentsRouter.post("/:id/archive", async (req, res) => {
  const parsed = archiveSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "An archive reason is required" });

  const doc = await prisma.medicalDocument.findUnique({ where: { id: req.params.id } });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.isArchived) return res.status(400).json({ error: "Document is already archived" });

  const updated = await prisma.medicalDocument.update({
    where: { id: doc.id },
    data: { isArchived: true, archiveReason: parsed.data.reason },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "ARCHIVE_DOC", entityType: "MedicalDocument", entityId: doc.id, employeeId: doc.employeeId, details: { reason: parsed.data.reason } });

  res.json(updated);
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
// Any APE record that cites this document as its source is detached
// (documentId -> null) rather than blocked or cascaded — the APE data
// itself is a separate clinical record and must survive the document
// being removed.
const deleteSchema = z.object({ reason: z.string().min(1) });

documentsRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this document" });

  const doc = await prisma.medicalDocument.findUnique({
    where: { id: req.params.id },
    include: { uploadedBy: { select: { fullName: true } } },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_DOCUMENT", entityType: "MedicalDocument", entityId: doc.id, employeeId: doc.employeeId,
    details: { category: doc.category, title: doc.title, originalUploadedBy: doc.uploadedBy.fullName, reason: parsed.data.reason },
  });

  await prisma.$transaction([
    prisma.annualPhysicalExam.updateMany({ where: { documentId: doc.id }, data: { documentId: null } }),
    prisma.medicalDocument.delete({ where: { id: doc.id } }),
  ]);

  if (fs.existsSync(doc.filePath)) fs.rm(doc.filePath, { force: true }, () => {});

  res.status(204).send();
});
