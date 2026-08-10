export const VISIT_CATEGORIES = ["CONSULT", "INJURY", "ILLNESS", "FOLLOW_UP", "APE_REVIEW", "FIT_TO_WORK", "OTHER"];
export const DISPOSITIONS = ["RETURN_TO_WORK", "LIGHT_DUTY", "SENT_HOME", "REFERRED", "OBSERVATION"];

// Mirrors server/src/services/illnessCategories.ts ILLNESS_CATEGORIES — kept
// as a small hand-synced list here, same convention as VISIT_CATEGORIES/
// DISPOSITIONS above, rather than an extra round-trip fetch for a fixed set
// this small.
export const ILLNESS_CATEGORIES: { key: string; label: string }[] = [
  { key: "MUSCULOSKELETAL", label: "Musculoskeletal" },
  { key: "RESPIRATORY", label: "Respiratory" },
  { key: "GASTROINTESTINAL", label: "Gastrointestinal" },
  { key: "CARDIOVASCULAR", label: "Cardiovascular" },
  { key: "SKIN", label: "Skin" },
  { key: "INJURY_TRAUMA", label: "Injury / Trauma" },
  { key: "INFECTIOUS", label: "Infectious / Communicable" },
  { key: "NEUROLOGICAL", label: "Neurological" },
  { key: "MENTAL_HEALTH", label: "Mental Health" },
  { key: "EYE_ENT", label: "Eye / Ear / Nose / Throat" },
  { key: "GENITOURINARY", label: "Genitourinary" },
  { key: "METABOLIC_ENDOCRINE", label: "Metabolic / Endocrine" },
  { key: "DENTAL_ORAL", label: "Dental / Oral" },
  { key: "OTHER", label: "Other" },
];
export const ILLNESS_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(ILLNESS_CATEGORIES.map((c) => [c.key, c.label]));

export const NOTE_TYPE_LABEL: Record<string, string> = {
  DOCTOR: "Doctor's Note",
  NURSE: "Nurse's Note",
  DENTIST: "Dental Note",
};

// Which role may author which note type (mirrors server/src/services/notes.ts)
export const ROLE_NOTE_TYPE: Record<string, string | undefined> = {
  DOCTOR: "DOCTOR",
  DENTIST: "DENTIST",
  NURSE: "NURSE",
};

export type NoteFieldKey =
  | "chiefComplaint" | "assessment"
  | "diagnosis" | "treatment" | "recommendation"
  | "nursingDiagnosis" | "plan" | "intervention" | "evaluation";

export interface NoteFieldDef {
  key: NoteFieldKey;
  label: string;
}

// Single source of truth for which text fields each note type shows, and in
// what order — used by the note-entry form, the note display card, and the
// note edit form, so all three always stay in sync. Doctor's and Dentist's
// Notes share the same set; Nurse's Notes has its own.
const DOCTOR_DENTIST_FIELDS: NoteFieldDef[] = [
  { key: "chiefComplaint", label: "Chief Complaint" },
  { key: "assessment", label: "Assessment" },
  { key: "diagnosis", label: "Diagnosis" },
  { key: "treatment", label: "Treatment" },
  { key: "recommendation", label: "Recommendation" },
];

const NURSE_FIELDS: NoteFieldDef[] = [
  { key: "chiefComplaint", label: "Chief Complaint" },
  { key: "assessment", label: "Assessment" },
  { key: "nursingDiagnosis", label: "Nursing Diagnosis" },
  { key: "plan", label: "Plan" },
  { key: "intervention", label: "Intervention" },
  { key: "evaluation", label: "Evaluation" },
];

export const NOTE_FIELDS_BY_TYPE: Record<string, NoteFieldDef[]> = {
  DOCTOR: DOCTOR_DENTIST_FIELDS,
  DENTIST: DOCTOR_DENTIST_FIELDS,
  NURSE: NURSE_FIELDS,
};

// Which field carries the diagnosis-bearing text for each note type — used
// to know what to send to the illness-category auto-suggest endpoint.
export const DIAGNOSIS_FIELD_BY_TYPE: Record<string, NoteFieldKey> = {
  DOCTOR: "diagnosis",
  DENTIST: "diagnosis",
  NURSE: "nursingDiagnosis",
};

export interface Author {
  fullName: string;
  role: string;
  isActive?: boolean;
}

export interface Addendum {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
}

export interface ClinicalNote {
  id: string;
  employeeId: string;
  authorId: string;
  noteType: string;
  visitDateTime: string;
  visitCategory: string | null;
  chiefComplaint: string | null;
  assessment: string | null;
  // Doctor's/Dentist's Notes
  diagnosis: string | null;
  treatment: string | null;
  recommendation: string | null;
  // Nurse's Notes
  nursingDiagnosis: string | null;
  plan: string | null;
  intervention: string | null;
  evaluation: string | null;
  illnessCategory: string | null;
  disposition: string | null;
  referredTo: string | null;
  followUpDate: string | null;
  isWorkRelated: boolean;
  status: "FINAL" | "VOIDED";
  voidReason: string | null;
  voidedAt: string | null;
  editableUntil: string | null;
  createdAt: string;
  author: Author;
  addenda: Addendum[];
}
