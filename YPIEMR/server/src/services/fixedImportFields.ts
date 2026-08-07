import { FieldDef } from "./excelEngine";

// Field definitions for the three import types that are NOT admin-customizable
// (only APE gets the template builder — §8.1). These map directly onto real
// columns on Employee / MedicationLog / ClinicalNote.
export const EMPLOYEES_FIELDS: FieldDef[] = [
  { key: "last_name", label: "Last Name", dataType: "TEXT", isRequired: true },
  { key: "first_name", label: "First Name", dataType: "TEXT", isRequired: true },
  { key: "middle_name", label: "Middle Name", dataType: "TEXT" },
  { key: "suffix", label: "Suffix", dataType: "TEXT" },
  { key: "date_of_birth", label: "Date of Birth", dataType: "DATE" },
  { key: "sex", label: "Sex", dataType: "SELECT", options: ["MALE", "FEMALE"] },
  { key: "civil_status", label: "Civil Status", dataType: "TEXT" },
  { key: "blood_type", label: "Blood Type", dataType: "TEXT" },
  { key: "religion", label: "Religion", dataType: "TEXT" },
  { key: "company_name", label: "Company/Agency", dataType: "TEXT" },
  { key: "department", label: "Department", dataType: "TEXT" },
  { key: "position", label: "Position", dataType: "TEXT" },
  { key: "employment_status", label: "Employment Status", dataType: "TEXT" },
  { key: "date_hired", label: "Date Hired", dataType: "DATE" },
  { key: "mobile_number", label: "Mobile Number", dataType: "TEXT" },
  { key: "address", label: "Address", dataType: "TEXT" },
  { key: "emergency_contact_name", label: "Emergency Contact Name", dataType: "TEXT" },
  { key: "emergency_contact_relation", label: "Emergency Contact Relation", dataType: "TEXT" },
  { key: "emergency_contact_number", label: "Emergency Contact Number", dataType: "TEXT" },
  { key: "known_allergies", label: "Known Allergies", dataType: "TEXT" },
  { key: "chronic_conditions", label: "Chronic Conditions", dataType: "TEXT" },
];

export const MEDICATIONS_FIELDS: FieldDef[] = [
  { key: "dispensed_at", label: "Date Dispensed", dataType: "DATE", isRequired: true },
  { key: "drug_name", label: "Drug Name", dataType: "TEXT", isRequired: true },
  { key: "strength", label: "Strength", dataType: "TEXT" },
  { key: "dosage_form", label: "Dosage Form", dataType: "TEXT" },
  { key: "route", label: "Route", dataType: "TEXT" },
  { key: "frequency", label: "Frequency", dataType: "TEXT" },
  { key: "quantity_dispensed", label: "Quantity Dispensed", dataType: "TEXT" },
  { key: "indication", label: "Indication", dataType: "TEXT" },
  { key: "remarks", label: "Remarks", dataType: "TEXT" },
];

// A single flat template covers all three note types (one "Note Type"
// column picks the type per row), so it carries the union of both field
// sets — Doctor's/Dentist's (diagnosis/treatment/recommendation) and
// Nurse's (nursing_diagnosis/plan/intervention/evaluation). Columns not
// relevant to a given row's note type are simply left blank.
export const HISTORICAL_NOTES_FIELDS: FieldDef[] = [
  { key: "visit_date", label: "Visit Date", dataType: "DATE", isRequired: true },
  { key: "note_type", label: "Note Type", dataType: "SELECT", options: ["DOCTOR", "NURSE", "DENTIST"], isRequired: true },
  { key: "legacy_author_name", label: "Original Author (legacy)", dataType: "TEXT", isRequired: true },
  { key: "chief_complaint", label: "Chief Complaint", dataType: "TEXT" },
  { key: "assessment", label: "Assessment", dataType: "TEXT" },
  { key: "diagnosis", label: "Diagnosis (Doctor's/Dentist's)", dataType: "TEXT" },
  { key: "treatment", label: "Treatment (Doctor's/Dentist's)", dataType: "TEXT" },
  { key: "recommendation", label: "Recommendation (Doctor's/Dentist's)", dataType: "TEXT" },
  { key: "nursing_diagnosis", label: "Nursing Diagnosis (Nurse's)", dataType: "TEXT" },
  { key: "plan", label: "Plan (Nurse's)", dataType: "TEXT" },
  { key: "intervention", label: "Intervention (Nurse's)", dataType: "TEXT" },
  { key: "evaluation", label: "Evaluation (Nurse's)", dataType: "TEXT" },
  { key: "disposition", label: "Disposition", dataType: "SELECT", options: ["RETURN_TO_WORK", "LIGHT_DUTY", "SENT_HOME", "REFERRED", "OBSERVATION"] },
  { key: "is_work_related", label: "Work-related", dataType: "BOOLEAN" },
];

// Drug Test and Pre-Employment are their own independent fixed import types
// (own template workbook, own dry-run/commit flow) — not admin-customizable
// like APE, and not folded into the APE or Historical Notes templates.
// company_name is optional and free-text (matched against the admin-managed
// Company list, case-insensitively/trimmed, creating a new company if it's
// genuinely new) — for the common case of a single-company batch, leave it
// blank and pick a default company at upload time instead (see
// AdminImport.tsx); fill it per-row only for a mixed-company batch. Can't be
// a fixed SELECT of options since the valid company list is admin-defined
// and open-ended, not a hardcoded enum.
const EMPLOYMENT_COLUMNS: FieldDef[] = [
  { key: "company_name", label: "Company Name", dataType: "TEXT" },
];

export const DRUG_TEST_FIELDS: FieldDef[] = [
  { key: "test_date", label: "Test Date", dataType: "DATE", isRequired: true },
  { key: "result", label: "Result", dataType: "SELECT", options: ["NEGATIVE", "POSITIVE", "PENDING"], isRequired: true },
  { key: "specimen_type", label: "Specimen Type", dataType: "TEXT" },
  { key: "lab_name", label: "Lab Name", dataType: "TEXT" },
  { key: "remarks", label: "Remarks", dataType: "TEXT" },
  ...EMPLOYMENT_COLUMNS,
];

// Pre-employment screening — distinct from APE (periodic/annual); includes
// fields specific to pre-employment (pregnancy test, medical history)
// alongside the same exam-vitals shape APE uses.
export const PRE_EMPLOYMENT_FIELDS: FieldDef[] = [
  { key: "exam_date", label: "Exam Date", dataType: "DATE" },
  { key: "provider", label: "Examining Provider", dataType: "TEXT" },
  { key: "height_cm", label: "Height", dataType: "NUMBER", unit: "cm", min: 100, max: 220 },
  { key: "weight_kg", label: "Weight", dataType: "NUMBER", unit: "kg", min: 20, max: 300 },
  { key: "blood_pressure", label: "Blood Pressure", dataType: "TEXT" },
  { key: "vision_od", label: "Vision (OD - right eye)", dataType: "TEXT" },
  { key: "vision_os", label: "Vision (OS - left eye)", dataType: "TEXT" },
  { key: "hearing", label: "Hearing", dataType: "TEXT" },
  { key: "cbc_result", label: "CBC Result", dataType: "TEXT" },
  { key: "urinalysis_result", label: "Urinalysis Result", dataType: "TEXT" },
  { key: "fecalysis_result", label: "Fecalysis Result", dataType: "TEXT" },
  { key: "chest_xray_result", label: "Chest X-ray Result", dataType: "TEXT" },
  { key: "ecg_result", label: "ECG Result", dataType: "TEXT" },
  { key: "drug_test_result", label: "Drug Test Result", dataType: "SELECT", options: ["NEGATIVE", "POSITIVE", "PENDING"] },
  { key: "pregnancy_test_result", label: "Pregnancy Test", dataType: "TEXT" },
  { key: "medical_history", label: "Medical History", dataType: "TEXT" },
  { key: "physical_exam_findings", label: "Physical Exam Findings", dataType: "TEXT" },
  { key: "other_findings", label: "Other Findings", dataType: "TEXT" },
  { key: "significant_findings", label: "Significant Findings", dataType: "TEXT" },
  { key: "recommendations", label: "Recommendations", dataType: "TEXT" },
  {
    key: "fitness_classification", label: "Fitness Classification", dataType: "SELECT",
    options: ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"],
  },
  ...EMPLOYMENT_COLUMNS,
];

export const FIXED_IMPORT_TYPES = ["EMPLOYEES", "MEDICATIONS", "HISTORICAL_NOTES", "DRUG_TEST", "PRE_EMPLOYMENT"] as const;
export type FixedImportType = (typeof FIXED_IMPORT_TYPES)[number];

export const FIXED_FIELDS_BY_TYPE: Record<FixedImportType, FieldDef[]> = {
  EMPLOYEES: EMPLOYEES_FIELDS,
  MEDICATIONS: MEDICATIONS_FIELDS,
  HISTORICAL_NOTES: HISTORICAL_NOTES_FIELDS,
  DRUG_TEST: DRUG_TEST_FIELDS,
  PRE_EMPLOYMENT: PRE_EMPLOYMENT_FIELDS,
};
