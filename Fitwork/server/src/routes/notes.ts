import { Router } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { createNote, editNote, addAddendum, voidNote, reviewIllnessCategory, NoteError } from "../services/notes";
import { buildReportPdf, pickVitalsForNote, ReportSection, ReportNote, ReportMedication } from "../services/reportPdf";
import { getAppName } from "../services/appSettings";
import { ILLNESS_CATEGORY_KEYS, suggestIllnessCategory } from "../services/illnessCategories";

export const notesRouter = Router();
notesRouter.use(requireAuth);

const NOTE_TYPES = ["DOCTOR", "NURSE", "DENTIST"] as const;
const VISIT_CATEGORIES = ["CONSULT", "INJURY", "ILLNESS", "FOLLOW_UP", "APE_REVIEW", "FIT_TO_WORK", "OTHER"] as const;
const DISPOSITIONS = ["RETURN_TO_WORK", "LIGHT_DUTY", "SENT_HOME", "REFERRED", "OBSERVATION"] as const;

const createSchema = z.object({
  employeeId: z.string().uuid(),
  noteType: z.enum(NOTE_TYPES),
  visitDateTime: z.string().optional(),
  visitCategory: z.enum(VISIT_CATEGORIES).optional(),
  chiefComplaint: z.string().optional(),
  assessment: z.string().optional(),
  diagnosis: z.string().optional(),
  treatment: z.string().optional(),
  recommendation: z.string().optional(),
  nursingDiagnosis: z.string().optional(),
  plan: z.string().optional(),
  intervention: z.string().optional(),
  evaluation: z.string().optional(),
  illnessCategory: z.enum(ILLNESS_CATEGORY_KEYS as [string, ...string[]]).optional(),
  disposition: z.enum(DISPOSITIONS).optional(),
  referredTo: z.string().optional(),
  followUpDate: z.string().optional(),
  isWorkRelated: z.boolean().optional(),
});

function handleNoteError(res: import("express").Response, err: unknown) {
  if (err instanceof NoteError) return res.status(err.status).json({ error: err.message });
  throw err;
}

// Every note/addendum read below still `include`s the live author/voidedBy
// relation for role/isActive (those SHOULD reflect current status — e.g.
// NoteCard's "(inactive)" badge), but the displayed NAME must come from the
// at-write-time snapshot columns (see schema.prisma), not the live join,
// so correcting a user's name later can't retroactively change whose
// byline appears on a note they already wrote. Applied at this one
// boundary rather than in every route below, so nothing downstream needs
// to know these are snapshots rather than a live relation.
function withNameSnapshots<
  T extends {
    authorNameSnapshot: string;
    author: { fullName: string; [k: string]: unknown };
    voidedByNameSnapshot?: string | null;
    voidedBy?: { fullName: string; [k: string]: unknown } | null;
    addenda?: { authorNameSnapshot: string; author: { fullName: string; [k: string]: unknown } }[];
  },
>(note: T) {
  return {
    ...note,
    author: { ...note.author, fullName: note.authorNameSnapshot },
    ...(note.voidedBy
      ? { voidedBy: { ...note.voidedBy, fullName: note.voidedByNameSnapshot || note.voidedBy.fullName } }
      : {}),
    ...(note.addenda
      ? { addenda: note.addenda.map((a) => ({ ...a, author: { ...a.author, fullName: a.authorNameSnapshot } })) }
      : {}),
  };
}

notesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { visitDateTime, followUpDate, ...rest } = parsed.data;

  try {
    const note = await createNote(req.currentUser!.id, req.currentUser!.fullName, req.currentUser!.role, {
      ...rest,
      visitDateTime: visitDateTime ? new Date(visitDateTime) : undefined,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
    });
    await writeAudit({ req, userId: req.currentUser!.id, action: "CREATE_NOTE", entityType: "ClinicalNote", entityId: note.id, employeeId: note.employeeId, details: { noteType: note.noteType } });
    res.status(201).json(note);
  } catch (err) {
    handleNoteError(res, err);
  }
});

const editSchema = createSchema.partial().omit({ employeeId: true, noteType: true });

notesRouter.patch("/:id", async (req, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { visitDateTime, followUpDate, ...rest } = parsed.data;

  try {
    const note = await editNote(req.params.id, req.currentUser!.id, {
      ...rest,
      visitDateTime: visitDateTime ? new Date(visitDateTime) : undefined,
      followUpDate: followUpDate ? new Date(followUpDate) : undefined,
    });
    res.json(note);
  } catch (err) {
    handleNoteError(res, err);
  }
});

// Best-effort keyword-based category suggestion for the charting form —
// never authoritative, always overridable before the note is submitted.
notesRouter.post("/suggest-illness-category", async (req, res) => {
  const parsed = z.object({ text: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "text is required" });
  res.json({ category: suggestIllnessCategory(parsed.data.text) });
});

// Post-hoc illness-category review/correction — a reporting-taxonomy fix,
// not a clinical-content edit, so it's open to any Nurse/Admin at any time
// (not gated by the self-correction window or original authorship like
// PATCH /:id above). Used to clear illnessCategoryNeedsReview after the
// historical backfill, or to reclassify a note if a category was wrong.
const reviewCategorySchema = z.object({ category: z.enum(ILLNESS_CATEGORY_KEYS as [string, ...string[]]).nullable() });

notesRouter.patch("/:id/illness-category", requireRole("NURSE", "ADMIN"), async (req, res) => {
  const parsed = reviewCategorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A valid category (or null) is required" });

  try {
    const note = await reviewIllnessCategory(req.params.id, parsed.data.category);
    await writeAudit({
      req, userId: req.currentUser!.id, action: "REVIEW_NOTE_CATEGORY", entityType: "ClinicalNote", entityId: note.id, employeeId: note.employeeId,
      details: { illnessCategory: parsed.data.category },
    });
    res.json(note);
  } catch (err) {
    handleNoteError(res, err);
  }
});

notesRouter.post("/:id/addendum", async (req, res) => {
  const parsed = z.object({ body: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  try {
    const addendum = await addAddendum(req.params.id, req.currentUser!.id, req.currentUser!.fullName, req.currentUser!.role, parsed.data.body);
    const note = await prisma.clinicalNote.findUnique({ where: { id: req.params.id } });
    await writeAudit({ req, userId: req.currentUser!.id, action: "ADD_ADDENDUM", entityType: "ClinicalNote", entityId: req.params.id, employeeId: note?.employeeId });
    res.status(201).json(addendum);
  } catch (err) {
    handleNoteError(res, err);
  }
});

notesRouter.post("/:id/void", async (req, res) => {
  const parsed = z.object({ reason: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A void reason is required" });

  try {
    const note = await voidNote(req.params.id, req.currentUser!.id, req.currentUser!.fullName, parsed.data.reason);
    await writeAudit({ req, userId: req.currentUser!.id, action: "VOID_NOTE", entityType: "ClinicalNote", entityId: note.id, employeeId: note.employeeId, details: { reason: parsed.data.reason } });
    res.json(note);
  } catch (err) {
    handleNoteError(res, err);
  }
});

notesRouter.get("/:id", async (req, res) => {
  const note = await prisma.clinicalNote.findUnique({
    where: { id: req.params.id },
    include: {
      author: { select: { fullName: true, role: true, isActive: true } },
      voidedBy: { select: { fullName: true } },
      addenda: { orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true, role: true } } } },
    },
  });
  if (!note) return res.status(404).json({ error: "Note not found" });
  res.json(withNameSnapshots(note));
});

// ── Permanent delete (admin-only) ──────────────────────────────────────
// Unlike void (which keeps the record but marks it retracted), this
// physically removes the row — reserved for genuine clinical-record cleanup
// with a permanent trace left in the Audit Log, since the row itself won't
// be there to consult afterward. Addenda/revisions are removed with it;
// medication log entries that reference this note are kept (they're their
// own clinical record) but detached (noteId -> null) since their parent is
// gone.
const deleteNoteSchema = z.object({ reason: z.string().min(1) });

notesRouter.delete("/:id", requireRole("ADMIN"), async (req, res) => {
  const parsed = deleteNoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A reason is required to permanently delete this note" });

  const note = await prisma.clinicalNote.findUnique({ where: { id: req.params.id } });
  if (!note) return res.status(404).json({ error: "Note not found" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DELETE_NOTE", entityType: "ClinicalNote", entityId: note.id, employeeId: note.employeeId,
    details: {
      noteType: note.noteType, visitDateTime: note.visitDateTime, originalAuthor: note.authorNameSnapshot,
      reason: parsed.data.reason,
    },
  });

  await prisma.$transaction([
    prisma.noteAddendum.deleteMany({ where: { noteId: note.id } }),
    prisma.noteRevision.deleteMany({ where: { noteId: note.id } }),
    prisma.medicationLog.updateMany({ where: { noteId: note.id }, data: { noteId: null } }),
    prisma.clinicalNote.delete({ where: { id: note.id } }),
  ]);

  res.status(204).send();
});

// Per-employee note list (used by the Doctor's/Nurse's/Dental profile tabs)
notesRouter.get("/", async (req, res) => {
  const { employeeId, noteType } = req.query;
  if (!employeeId) return res.status(400).json({ error: "employeeId is required" });

  const notes = await prisma.clinicalNote.findMany({
    where: { employeeId: String(employeeId), ...(noteType ? { noteType: String(noteType) } : {}) },
    orderBy: { visitDateTime: "desc" },
    include: {
      author: { select: { fullName: true, role: true, isActive: true } },
      addenda: { orderBy: { createdAt: "asc" }, include: { author: { select: { fullName: true, role: true } } } },
    },
  });
  res.json(notes.map(withNameSnapshots));
});

// ── Note Ledger (global, cross-employee) ───────────────────────────────
const ledgerFilterSchema = z.object({
  noteType: z.enum(NOTE_TYPES).optional(),
  authorId: z.string().uuid().optional(),
  department: z.string().optional(),
  isWorkRelated: z.enum(["true", "false"]).optional(),
  disposition: z.enum(DISPOSITIONS).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

function buildLedgerWhere(query: Record<string, unknown>) {
  const parsed = ledgerFilterSchema.parse(query);
  const where: Record<string, unknown> = {};
  if (parsed.noteType) where.noteType = parsed.noteType;
  if (parsed.authorId) where.authorId = parsed.authorId;
  if (parsed.disposition) where.disposition = parsed.disposition;
  if (parsed.isWorkRelated) where.isWorkRelated = parsed.isWorkRelated === "true";
  if (parsed.department) where.employee = { department: parsed.department };
  if (parsed.from || parsed.to) {
    where.visitDateTime = {
      ...(parsed.from ? { gte: new Date(parsed.from) } : {}),
      ...(parsed.to ? { lte: new Date(parsed.to) } : {}),
    };
  }
  return where;
}

notesRouter.get("/ledger/list", async (req, res) => {
  let where: Record<string, unknown>;
  try {
    where = buildLedgerWhere(req.query as Record<string, unknown>);
  } catch {
    return res.status(400).json({ error: "Invalid filter parameters" });
  }

  const notes = await prisma.clinicalNote.findMany({
    where,
    orderBy: { visitDateTime: "desc" },
    take: 500,
    include: {
      author: { select: { fullName: true, role: true } },
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true } },
    },
  });
  res.json(notes.map(withNameSnapshots));
});

notesRouter.get("/ledger/export", async (req, res) => {
  let where: Record<string, unknown>;
  try {
    where = buildLedgerWhere(req.query as Record<string, unknown>);
  } catch {
    return res.status(400).json({ error: "Invalid filter parameters" });
  }

  const notes = await prisma.clinicalNote.findMany({
    where,
    orderBy: { visitDateTime: "desc" },
    include: {
      employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
    },
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Note Ledger");
  sheet.columns = [
    { header: "Visit date", key: "visitDateTime", width: 18 },
    { header: "Employee code", key: "employeeCode", width: 14 },
    { header: "Employee name", key: "employeeName", width: 24 },
    { header: "Department", key: "department", width: 16 },
    { header: "Note type", key: "noteType", width: 12 },
    { header: "Author", key: "author", width: 20 },
    { header: "Chief complaint", key: "chiefComplaint", width: 30 },
    { header: "Disposition", key: "disposition", width: 16 },
    { header: "Work-related", key: "isWorkRelated", width: 12 },
    { header: "Status", key: "status", width: 10 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const n of notes) {
    sheet.addRow({
      visitDateTime: n.visitDateTime.toISOString().slice(0, 10),
      employeeCode: n.employee.employeeCode,
      employeeName: `${n.employee.lastName}, ${n.employee.firstName}`,
      department: n.employee.department || "",
      noteType: n.noteType,
      author: n.authorNameSnapshot,
      chiefComplaint: n.chiefComplaint || "",
      disposition: n.disposition || "",
      isWorkRelated: n.isWorkRelated ? "Yes" : "No",
      status: n.status,
    });
  }

  await writeAudit({ req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "NoteLedgerExport", details: { rowCount: notes.length } });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="note-ledger-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ── Periodic clinic report (Doctor's/Nurse's/Dentist's notes + meds) ───
// A reporting export, separate from the Note Ledger export above: it covers
// one day or a custom range across ALL note types plus medications. Each
// selected category becomes its own section in ONE combined PDF, laid out
// like a printed chart page (one bordered, labeled-field entry per record),
// not a raw spreadsheet — meant to be suitable for physical/official clinic
// records. Medications are a fully standalone section (not embedded per-note
// — see reportPdf.ts), so "Medications only" and "Notes only" are both just
// a matter of which categories are selected.
const REPORT_CATEGORIES = ["DOCTOR", "NURSE", "DENTIST", "MEDICATIONS"] as const;
type ReportCategory = (typeof REPORT_CATEGORIES)[number];

const clinicReportSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  categories: z.string().optional(),
});

const CATEGORY_LABEL: Record<ReportCategory, string> = {
  DOCTOR: "Doctor's Notes", NURSE: "Nurse's Notes", DENTIST: "Dentist's Notes", MEDICATIONS: "Medications",
};

notesRouter.get("/reports/export", requireRole("ADMIN"), async (req, res) => {
  const parsed = clinicReportSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "A from and to date are both required" });
  const { from, to } = parsed.data;

  const fromDate = new Date(from);
  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
    return res.status(400).json({ error: "Invalid from/to date" });
  }

  const requested = parsed.data.categories
    ? parsed.data.categories.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : [...REPORT_CATEGORIES];
  const categories = requested.filter((c): c is ReportCategory => (REPORT_CATEGORIES as readonly string[]).includes(c));
  if (categories.length === 0) return res.status(400).json({ error: "At least one category is required" });

  const noteTypesToExport = categories.filter((c): c is (typeof NOTE_TYPES)[number] => (NOTE_TYPES as readonly string[]).includes(c));
  let totalNotes = 0;
  const employeeIds = new Set<string>();
  const rawNotesByType: Record<string, Awaited<ReturnType<typeof fetchNotes>>> = {};

  function fetchNotes(nt: string) {
    return prisma.clinicalNote.findMany({
      where: { noteType: nt, visitDateTime: { gte: fromDate, lte: toDate } },
      orderBy: { visitDateTime: "asc" },
      include: {
        employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true, department: true, company: { select: { name: true } } } },
      },
    });
  }

  for (const nt of noteTypesToExport) {
    const notes = await fetchNotes(nt);
    rawNotesByType[nt] = notes;
    totalNotes += notes.length;
    for (const n of notes) employeeIds.add(n.employeeId);
  }

  const vitalsInRange = employeeIds.size
    ? await prisma.vitalsRecord.findMany({
        where: { employeeId: { in: Array.from(employeeIds) }, recordedAt: { gte: fromDate, lte: toDate } },
      })
    : [];

  const sections: ReportSection[] = noteTypesToExport.map((nt) => ({
    kind: "NOTES",
    noteType: nt,
    notes: rawNotesByType[nt].map((n): ReportNote => ({
      noteType: n.noteType,
      visitDateTime: n.visitDateTime,
      employeeCode: n.employee.employeeCode,
      employeeName: `${n.employee.lastName}, ${n.employee.firstName}`,
      department: n.employee.department,
      companyName: n.employee.company?.name ?? null,
      authorName: n.authorNameSnapshot,
      chiefComplaint: n.chiefComplaint,
      assessment: n.assessment,
      diagnosis: n.diagnosis,
      treatment: n.treatment,
      recommendation: n.recommendation,
      nursingDiagnosis: n.nursingDiagnosis,
      plan: n.plan,
      intervention: n.intervention,
      evaluation: n.evaluation,
      disposition: n.disposition,
      isWorkRelated: n.isWorkRelated,
      status: n.status,
      vitals: pickVitalsForNote(vitalsInRange, n.employeeId, n.visitDateTime),
    })),
  }));

  let medicationCount = 0;
  if (categories.includes("MEDICATIONS")) {
    const meds = await prisma.medicationLog.findMany({
      where: { dispensedAt: { gte: fromDate, lte: toDate } },
      orderBy: { dispensedAt: "asc" },
      include: {
        dispensedBy: { select: { fullName: true } },
        employee: { select: { employeeCode: true, firstName: true, lastName: true, department: true } },
      },
    });
    medicationCount = meds.length;
    const allMedications: ReportMedication[] = meds.map((m) => ({
      drugName: m.drugName, strength: m.strength, dosageForm: m.dosageForm, route: m.route,
      frequency: m.frequency, quantityDispensed: m.quantityDispensed, dispensedAt: m.dispensedAt,
      dispensedByName: m.dispensedBy.fullName, employeeCode: m.employee.employeeCode,
      employeeName: `${m.employee.lastName}, ${m.employee.firstName}`, department: m.employee.department,
    }));
    sections.push({ kind: "MEDICATIONS", medications: allMedications });
  }

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "ClinicReportExport",
    details: { from, to, categories, noteCount: totalNotes, medicationCount },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="clinic-report-${from}_to_${to}.pdf"`);
  const appName = await getAppName();
  const doc = buildReportPdf({
    appName,
    title: "Clinic Report",
    subtitleLines: [
      `Period: ${from} to ${to}`,
      `Categories: ${categories.map((c) => CATEGORY_LABEL[c]).join(", ")}`,
      `Generated by ${req.currentUser!.fullName} on ${new Date().toLocaleString()}`,
    ],
    sections,
  });
  doc.pipe(res);
});
