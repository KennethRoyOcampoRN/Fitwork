import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { generateWorkbook, FieldDef, FieldDataType } from "../services/excelEngine";
import { APE_CATALOG } from "../services/apeCatalog";

export const templatesRouter = Router();
templatesRouter.use(requireAuth, requireRole("ADMIN"));

templatesRouter.get("/catalog", (_req, res) => {
  res.json(APE_CATALOG);
});

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

const fieldInputSchema = z.object({
  key: z.string().optional(),
  label: z.string().min(1),
  dataType: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"]),
  options: z.array(z.string()).optional(),
  unit: z.string().optional(),
  isRequired: z.boolean().optional(),
  section: z.string().optional(),
  mapsToCoreColumn: z.string().optional(),
});

const templateInputSchema = z.object({
  name: z.string().min(1),
  notes: z.string().optional(),
  fields: z.array(fieldInputSchema).min(1),
});

templatesRouter.get("/", async (_req, res) => {
  const templates = await prisma.aPETemplate.findMany({
    orderBy: [{ name: "asc" }, { version: "desc" }],
    include: { fields: { orderBy: { displayOrder: "asc" } }, createdBy: { select: { fullName: true } } },
  });
  res.json(templates);
});

templatesRouter.get("/:id", async (req, res) => {
  const template = await prisma.aPETemplate.findUnique({
    where: { id: req.params.id },
    include: { fields: { orderBy: { displayOrder: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });
  res.json(template);
});

templatesRouter.post("/", async (req, res) => {
  const parsed = templateInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const seenKeys = new Set<string>();
  const fieldsData = parsed.data.fields.map((f, i) => {
    const key = f.key || slugify(f.label);
    if (seenKeys.has(key)) throw new Error(`Duplicate field key: ${key}`);
    seenKeys.add(key);
    return {
      key,
      label: f.label,
      dataType: f.dataType,
      optionsJson: f.options ? JSON.stringify(f.options) : null,
      unit: f.unit,
      isRequired: f.isRequired ?? false,
      section: f.section,
      displayOrder: i,
      mapsToCoreColumn: f.mapsToCoreColumn,
    };
  });

  const template = await prisma.aPETemplate.create({
    data: {
      name: parsed.data.name,
      version: 1,
      importType: "APE",
      isLocked: false,
      createdById: req.currentUser!.id,
      notes: parsed.data.notes,
      fields: { create: fieldsData },
    },
    include: { fields: true },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "IMPORT_RUN", entityType: "APETemplate", entityId: template.id, details: { action: "template_created", name: template.name } });

  res.status(201).json(template);
});

// Editing a template that already has imported data creates v2 instead of
// mutating fields in place (§8.1) — a locked template is never touched.
templatesRouter.put("/:id", async (req, res) => {
  const parsed = templateInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const existing = await prisma.aPETemplate.findUnique({ where: { id: req.params.id }, include: { fields: true } });
  if (!existing) return res.status(404).json({ error: "Template not found" });

  const seenKeys = new Set<string>();
  const fieldsData = parsed.data.fields.map((f, i) => {
    const key = f.key || slugify(f.label);
    if (seenKeys.has(key)) throw new Error(`Duplicate field key: ${key}`);
    seenKeys.add(key);
    return {
      key,
      label: f.label,
      dataType: f.dataType,
      optionsJson: f.options ? JSON.stringify(f.options) : null,
      unit: f.unit,
      isRequired: f.isRequired ?? false,
      section: f.section,
      displayOrder: i,
      mapsToCoreColumn: f.mapsToCoreColumn,
    };
  });

  if (!existing.isLocked) {
    await prisma.$transaction([
      prisma.aPETemplateField.deleteMany({ where: { templateId: existing.id } }),
      prisma.aPETemplate.update({
        where: { id: existing.id },
        data: { name: parsed.data.name, notes: parsed.data.notes, fields: { create: fieldsData } },
      }),
    ]);
    const updated = await prisma.aPETemplate.findUnique({ where: { id: existing.id }, include: { fields: true } });
    return res.json(updated);
  }

  const newVersion = await prisma.aPETemplate.create({
    data: {
      name: existing.name,
      version: existing.version + 1,
      importType: existing.importType,
      isLocked: false,
      createdById: req.currentUser!.id,
      notes: parsed.data.notes,
      fields: { create: fieldsData },
    },
    include: { fields: true },
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "IMPORT_RUN", entityType: "APETemplate", entityId: newVersion.id, details: { action: "template_versioned", name: newVersion.name, version: newVersion.version } });

  res.status(201).json(newVersion);
});

const generateSchema = z.object({
  examYear: z.number().int().min(2000).max(2100),
  rosterFill: z.boolean().default(true),
  department: z.string().optional(),
});

templatesRouter.post("/:id/generate", async (req, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const template = await prisma.aPETemplate.findUnique({
    where: { id: req.params.id },
    include: { fields: { orderBy: { displayOrder: "asc" } } },
  });
  if (!template) return res.status(404).json({ error: "Template not found" });

  const fields: FieldDef[] = template.fields.map((f) => ({
    key: f.key,
    label: f.label,
    dataType: f.dataType as FieldDataType,
    options: f.optionsJson ? JSON.parse(f.optionsJson) : undefined,
    unit: f.unit ?? undefined,
    isRequired: f.isRequired,
    section: f.section ?? undefined,
  }));

  const roster = parsed.data.rosterFill
    ? (await prisma.employee.findMany({
        where: { isActive: true, ...(parsed.data.department ? { department: parsed.data.department } : {}) },
        orderBy: { lastName: "asc" },
        select: { employeeCode: true, firstName: true, lastName: true, middleName: true },
      })).map((e) => ({ employeeCode: e.employeeCode, lastName: e.lastName, firstName: e.firstName, middleName: e.middleName ?? "" }))
    : [];

  const workbook = generateWorkbook({
    fields,
    meta: {
      templateId: template.id,
      templateVersion: template.version,
      importType: "APE",
      examYear: parsed.data.examYear,
      generatedAt: new Date().toISOString(),
      generatedBy: req.currentUser!.fullName,
    },
    roster,
    templateName: `${template.name} (v${template.version}) — APE ${parsed.data.examYear}`,
  });

  await writeAudit({ req, userId: req.currentUser!.id, action: "IMPORT_RUN", entityType: "APETemplate", entityId: template.id, details: { action: "workbook_generated", examYear: parsed.data.examYear } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="APE-${template.name.replace(/\s+/g, "_")}-${parsed.data.examYear}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
