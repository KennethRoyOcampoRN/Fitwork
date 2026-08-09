// Maps AnnualPhysicalExam's free-text lab/diagnostic result fields to the
// same test-type names LabTestResult uses, so the Lab/Diagnostic Test
// report (routes/reportsCsv.ts) can count an APE's chest X-ray, CBC, etc.
// alongside standalone LabTestResult entries without merging the two
// models — see the design discussion in AGENTS/commit history for why they
// stay separate (APE is a once-a-year fitness-panel snapshot; LabTestResult
// is an append-only any-time event log with a structured result status).
//
// Hand-synced with client/src/components/LabTestTab.tsx's copy (same
// small-fixed-list convention as ILLNESS_CATEGORIES elsewhere in the app)
// — the client needs the same field->label mapping to warn a nurse who's
// about to record a test type an employee's current-year APE already has.
export const APE_LAB_FIELD_TO_TEST_TYPE: Record<string, string> = {
  cbcResult: "CBC",
  urinalysisResult: "Urinalysis",
  fecalysisResult: "Fecalysis",
  chestXrayResult: "Chest X-ray",
  ecgResult: "ECG",
  drugTestResult: "Drug Test",
  hepatitisScreeningResult: "Hepatitis Screening",
  hepaProfileResult: "Hepatitis Profile",
};

export type ApeLabField = keyof typeof APE_LAB_FIELD_TO_TEST_TYPE;
export const APE_LAB_FIELDS = Object.keys(APE_LAB_FIELD_TO_TEST_TYPE) as ApeLabField[];
