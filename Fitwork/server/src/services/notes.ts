import { DateTime } from "luxon";
import { prisma } from "../lib/prisma";
import { config, Role } from "../config";

export const NOTE_TYPE_BY_ROLE: Partial<Record<Role, string>> = {
  DOCTOR: "DOCTOR",
  DENTIST: "DENTIST",
  NURSE: "NURSE",
};

export class NoteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function roleCanAuthor(role: Role, noteType: string): boolean {
  return NOTE_TYPE_BY_ROLE[role] === noteType;
}

// Any *clinician* (not admin — admin is operational, not clinical, per §4).
export function roleCanAddendum(role: Role): boolean {
  return role === "DOCTOR" || role === "DENTIST" || role === "NURSE";
}

// Doctor's/Dentist's Notes use chiefComplaint/assessment/diagnosis/treatment/
// recommendation; Nurse's Notes use chiefComplaint/assessment/
// nursingDiagnosis/plan/intervention/evaluation. Both sets are listed here
// together since this table (and this edit-diffing logic) covers all three
// note types generically — the note-entry form only shows the subset that
// applies to the note's type.
const NOTE_BODY_FIELDS = [
  "visitDateTime", "visitCategory", "chiefComplaint", "assessment",
  "diagnosis", "treatment", "recommendation",
  "nursingDiagnosis", "plan", "intervention", "evaluation",
  "illnessCategory",
  "disposition", "referredTo", "followUpDate", "isWorkRelated",
] as const;

export interface NoteInput {
  employeeId: string;
  noteType: string;
  visitDateTime?: Date;
  visitCategory?: string;
  chiefComplaint?: string;
  assessment?: string;
  diagnosis?: string;
  treatment?: string;
  recommendation?: string;
  nursingDiagnosis?: string;
  plan?: string;
  intervention?: string;
  evaluation?: string;
  illnessCategory?: string;
  disposition?: string;
  referredTo?: string;
  followUpDate?: Date;
  isWorkRelated?: boolean;
}

export async function createNote(authorId: string, authorFullName: string, role: Role, input: NoteInput) {
  if (!roleCanAuthor(role, input.noteType)) {
    throw new NoteError(403, `Role ${role} cannot author a ${input.noteType} note`);
  }

  const employee = await prisma.employee.findUnique({ where: { id: input.employeeId } });
  if (!employee) throw new NoteError(404, "Employee not found");

  const editableUntil =
    config.selfEditWindowMinutes > 0
      ? DateTime.now().plus({ minutes: config.selfEditWindowMinutes }).toJSDate()
      : null;

  const note = await prisma.clinicalNote.create({
    data: {
      employeeId: input.employeeId,
      authorId,
      authorNameSnapshot: authorFullName,
      noteType: input.noteType,
      visitDateTime: input.visitDateTime ?? new Date(),
      visitCategory: input.visitCategory,
      chiefComplaint: input.chiefComplaint,
      assessment: input.assessment,
      diagnosis: input.diagnosis,
      treatment: input.treatment,
      recommendation: input.recommendation,
      nursingDiagnosis: input.nursingDiagnosis,
      plan: input.plan,
      intervention: input.intervention,
      evaluation: input.evaluation,
      illnessCategory: input.illnessCategory,
      disposition: input.disposition,
      referredTo: input.referredTo,
      followUpDate: input.followUpDate,
      isWorkRelated: input.isWorkRelated ?? false,
      status: "FINAL",
      sourceType: "MANUAL",
      editableUntil,
    },
  });

  return note;
}

/**
 * Self-correction window (§7 rule 2): only the original author, only within
 * SELF_EDIT_WINDOW_MINUTES of creation, never voided notes, never another
 * user's note, never bypassable by admin. Every edit writes a full
 * before/after snapshot — nothing is silently overwritten.
 */
export async function editNote(noteId: string, editorId: string, patch: Partial<NoteInput>) {
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw new NoteError(404, "Note not found");

  if (note.authorId !== editorId) {
    throw new NoteError(403, "Only the original author may edit this note");
  }
  if (note.status === "VOIDED") {
    throw new NoteError(403, "Voided notes cannot be edited");
  }
  if (!note.editableUntil || note.editableUntil < new Date()) {
    throw new NoteError(403, "The self-correction window for this note has closed");
  }

  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};

  for (const field of NOTE_BODY_FIELDS) {
    if (field in patch && (patch as Record<string, unknown>)[field] !== undefined) {
      before[field] = (note as unknown as Record<string, unknown>)[field];
      after[field] = (patch as Record<string, unknown>)[field];
      data[field] = (patch as Record<string, unknown>)[field];
    }
  }

  if (Object.keys(data).length === 0) return note;

  const [, , updated] = await prisma.$transaction([
    prisma.noteRevision.create({
      data: {
        noteId: note.id,
        editedById: editorId,
        beforeJson: JSON.stringify(before),
        afterJson: JSON.stringify(after),
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: editorId,
        action: "EDIT_NOTE",
        entityType: "ClinicalNote",
        entityId: note.id,
        employeeId: note.employeeId,
        detailsJson: JSON.stringify({ before, after }),
      },
    }),
    prisma.clinicalNote.update({ where: { id: note.id }, data }),
  ]);

  return updated;
}

/**
 * Post-hoc illness-category correction (Nurse/Admin, any note, any time) —
 * distinct from editNote's self-correction window, since this only touches
 * a reporting-taxonomy field, never the clinical narrative itself. Used both
 * for reviewing auto-suggested categories from the historical backfill and
 * for general reclassification if a category turns out to be wrong later.
 */
export async function reviewIllnessCategory(noteId: string, category: string | null) {
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw new NoteError(404, "Note not found");

  return prisma.clinicalNote.update({
    where: { id: noteId },
    data: { illnessCategory: category, illnessCategoryNeedsReview: false },
  });
}

export async function addAddendum(noteId: string, authorId: string, authorFullName: string, role: Role, body: string) {
  if (!roleCanAddendum(role)) {
    throw new NoteError(403, "Only clinicians may add an addendum");
  }
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw new NoteError(404, "Note not found");

  return prisma.noteAddendum.create({
    data: { noteId, authorId, authorNameSnapshot: authorFullName, body },
  });
}

/** Void, never delete (§7 rule 4) — own author only, mandatory reason. */
export async function voidNote(noteId: string, voidedById: string, voidedByFullName: string, reason: string) {
  const note = await prisma.clinicalNote.findUnique({ where: { id: noteId } });
  if (!note) throw new NoteError(404, "Note not found");
  if (note.authorId !== voidedById) {
    throw new NoteError(403, "Only the original author may void this note");
  }
  if (note.status === "VOIDED") {
    throw new NoteError(400, "Note is already voided");
  }
  if (!reason || !reason.trim()) {
    throw new NoteError(400, "A void reason is required");
  }

  return prisma.clinicalNote.update({
    where: { id: noteId },
    data: { status: "VOIDED", voidReason: reason, voidedById, voidedByNameSnapshot: voidedByFullName, voidedAt: new Date() },
  });
}
