import { FieldDef } from "./excelEngine";

// Standard field catalog (§8.1) the admin picks from when building an APE
// template. `mapsToCoreColumn` lets the importer write directly onto a real
// AnnualPhysicalExam column instead of the generic APEFieldValue table.
export interface CatalogField extends FieldDef {
  mapsToCoreColumn?: string;
}

export const APE_CATALOG: CatalogField[] = [
  { key: "height_cm", label: "Height", dataType: "NUMBER", unit: "cm", section: "Vitals", min: 100, max: 220, mapsToCoreColumn: "heightCm" },
  { key: "weight_kg", label: "Weight", dataType: "NUMBER", unit: "kg", section: "Vitals", min: 20, max: 300, mapsToCoreColumn: "weightKg" },
  { key: "blood_pressure", label: "Blood Pressure", dataType: "TEXT", section: "Vitals", mapsToCoreColumn: "bloodPressure" },
  { key: "vision_od", label: "Vision (OD - right eye)", dataType: "TEXT", section: "Vitals", mapsToCoreColumn: "visionOD" },
  { key: "vision_os", label: "Vision (OS - left eye)", dataType: "TEXT", section: "Vitals", mapsToCoreColumn: "visionOS" },
  { key: "hearing", label: "Hearing", dataType: "TEXT", section: "Vitals", mapsToCoreColumn: "hearing" },
  { key: "cbc_result", label: "CBC Result", dataType: "TEXT", section: "Laboratory", mapsToCoreColumn: "cbcResult" },
  { key: "urinalysis_result", label: "Urinalysis Result", dataType: "TEXT", section: "Laboratory", mapsToCoreColumn: "urinalysisResult" },
  { key: "fecalysis_result", label: "Fecalysis Result", dataType: "TEXT", section: "Laboratory", mapsToCoreColumn: "fecalysisResult" },
  { key: "drug_test_result", label: "Drug Test Result", dataType: "SELECT", options: ["NEGATIVE", "POSITIVE", "PENDING"], section: "Laboratory", mapsToCoreColumn: "drugTestResult" },
  { key: "hepatitis_screening_result", label: "Hepatitis Screening", dataType: "TEXT", section: "Laboratory", mapsToCoreColumn: "hepatitisScreeningResult" },
  { key: "hepa_profile_result", label: "Hepa Profile", dataType: "TEXT", section: "Laboratory", mapsToCoreColumn: "hepaProfileResult" },
  { key: "chest_xray_result", label: "Chest X-ray Result", dataType: "TEXT", section: "Imaging", mapsToCoreColumn: "chestXrayResult" },
  { key: "ecg_result", label: "ECG Result", dataType: "TEXT", section: "Imaging", mapsToCoreColumn: "ecgResult" },
  { key: "physical_exam_findings", label: "Physical Exam", dataType: "TEXT", section: "Findings", mapsToCoreColumn: "physicalExamFindings" },
  { key: "other_findings", label: "Other Findings", dataType: "TEXT", section: "Findings", mapsToCoreColumn: "otherFindings" },
  { key: "significant_findings", label: "Significant Findings", dataType: "TEXT", section: "Findings", mapsToCoreColumn: "significantFindings" },
  { key: "recommendations", label: "Recommendations", dataType: "TEXT", section: "Findings", mapsToCoreColumn: "recommendations" },
  {
    key: "fitness_classification", label: "Fitness Classification", dataType: "SELECT",
    options: ["CLASS_A", "CLASS_B", "CLASS_C", "CLASS_D", "PENDING"], section: "Findings", mapsToCoreColumn: "fitnessClassification",
  },
  { key: "provider", label: "Examining Provider", dataType: "TEXT", section: "Findings", mapsToCoreColumn: "provider" },
  { key: "exam_date", label: "Exam Date", dataType: "DATE", section: "Findings", mapsToCoreColumn: "examDate" },
];

export const CORE_COLUMN_NAMES = new Set(APE_CATALOG.map((f) => f.mapsToCoreColumn).filter(Boolean));
