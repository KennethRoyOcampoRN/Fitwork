import PDFDocument from "pdfkit";

export interface ReportVitalsSnapshot {
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  systolic: number | null;
  diastolic: number | null;
  pulseRate: number | null;
  respiratoryRate: number | null;
  temperatureC: number | null;
  oxygenSaturation: number | null;
}

export interface ReportMedication {
  drugName: string;
  strength: string | null;
  dosageForm: string | null;
  route: string | null;
  frequency: string | null;
  quantityDispensed: string | null;
  dispensedAt: Date;
  dispensedByName: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
}

export interface ReportNote {
  noteType: string;
  visitDateTime: Date;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  companyName: string | null;
  authorName: string;
  chiefComplaint: string | null;
  assessment: string | null;
  // Doctor's/Dentist's Notes fields
  diagnosis: string | null;
  treatment: string | null;
  recommendation: string | null;
  // Nurse's Notes fields
  nursingDiagnosis: string | null;
  plan: string | null;
  intervention: string | null;
  evaluation: string | null;
  disposition: string | null;
  isWorkRelated: boolean;
  status: string;
  vitals: ReportVitalsSnapshot | null;
  // Medications dispensed are intentionally NOT part of a note entry — they
  // get their own standalone "Medications" section (see MEDICATIONS
  // ReportSection below), never embedded per-note.
}

export interface ReportApe {
  employeeCode: string;
  employeeName: string;
  department: string | null;
  examYear: number;
  examDate: Date | null;
  provider: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bloodPressure: string | null;
  visionOD: string | null;
  visionOS: string | null;
  hearing: string | null;
  cbcResult: string | null;
  urinalysisResult: string | null;
  fecalysisResult: string | null;
  chestXrayResult: string | null;
  ecgResult: string | null;
  drugTestResult: string | null;
  otherFindings: string | null;
  significantFindings: string | null;
  recommendations: string | null;
  fitnessClassification: string | null;
}

export interface ReportVitalsRecord {
  employeeCode: string;
  employeeName: string;
  department: string | null;
  recordedAt: Date;
  recordedByName: string;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bmiCategory: string | null;
  systolic: number | null;
  diastolic: number | null;
  pulseRate: number | null;
  respiratoryRate: number | null;
  temperatureC: number | null;
  oxygenSaturation: number | null;
  remarks: string | null;
}

export interface ReportDrugTest {
  employeeCode: string;
  employeeName: string;
  department: string | null;
  testDate: Date;
  result: string;
  specimenType: string | null;
  labName: string | null;
  remarks: string | null;
}

export interface ReportPreEmployment {
  employeeCode: string;
  employeeName: string;
  department: string | null;
  examDate: Date | null;
  provider: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bloodPressure: string | null;
  visionOD: string | null;
  visionOS: string | null;
  hearing: string | null;
  cbcResult: string | null;
  urinalysisResult: string | null;
  fecalysisResult: string | null;
  chestXrayResult: string | null;
  ecgResult: string | null;
  drugTestResult: string | null;
  pregnancyTestResult: string | null;
  medicalHistory: string | null;
  physicalExamFindings: string | null;
  otherFindings: string | null;
  significantFindings: string | null;
  recommendations: string | null;
  fitnessClassification: string | null;
}

export type ReportSection =
  | { kind: "NOTES"; noteType: string; notes: ReportNote[] }
  | { kind: "MEDICATIONS"; medications: ReportMedication[] }
  | { kind: "APE"; apes: ReportApe[] }
  | { kind: "VITALS"; vitals: ReportVitalsRecord[] }
  | { kind: "DRUG_TEST"; drugTests: ReportDrugTest[] }
  | { kind: "PRE_EMPLOYMENT"; preEmployments: ReportPreEmployment[] };

// Field label/order per the note-entry form: Chief Complaint + Assessment
// are common to both, then the type-specific fields in the same order the
// forms show them.
function noteFieldsFor(note: ReportNote): [string, string | null][] {
  if (note.noteType === "NURSE") {
    return [
      ["Chief Complaint", note.chiefComplaint],
      ["Assessment", note.assessment],
      ["Nursing Diagnosis", note.nursingDiagnosis],
      ["Plan", note.plan],
      ["Intervention", note.intervention],
      ["Evaluation", note.evaluation],
    ];
  }
  return [
    ["Chief Complaint", note.chiefComplaint],
    ["Assessment", note.assessment],
    ["Diagnosis", note.diagnosis],
    ["Treatment", note.treatment],
    ["Recommendation", note.recommendation],
  ];
}

function apeFieldsFor(ape: ReportApe): [string, string | null][] {
  return [
    ["Exam Date", ape.examDate ? ape.examDate.toLocaleDateString() : null],
    ["Provider", ape.provider],
    ["Height/Weight", ape.heightCm || ape.weightKg ? `${ape.heightCm ?? "—"}cm / ${ape.weightKg ?? "—"}kg` : null],
    ["BMI", ape.bmi != null ? String(ape.bmi) : null],
    ["Blood Pressure", ape.bloodPressure],
    ["Vision OD/OS", ape.visionOD || ape.visionOS ? `${ape.visionOD || "—"} / ${ape.visionOS || "—"}` : null],
    ["Hearing", ape.hearing],
    ["CBC", ape.cbcResult],
    ["Urinalysis", ape.urinalysisResult],
    ["Fecalysis", ape.fecalysisResult],
    ["Chest X-ray", ape.chestXrayResult],
    ["ECG", ape.ecgResult],
    ["Drug Test", ape.drugTestResult],
    ["Other Findings", ape.otherFindings],
    ["Significant Findings", ape.significantFindings],
    ["Recommendations", ape.recommendations],
  ];
}

function vitalsLine(v: {
  systolic: number | null; diastolic: number | null; temperatureC: number | null; pulseRate: number | null;
  respiratoryRate: number | null; oxygenSaturation: number | null; heightCm: number | null; weightKg: number | null; bmi: number | null;
}): string {
  return [
    v.systolic && v.diastolic ? `BP ${v.systolic}/${v.diastolic}` : null,
    v.temperatureC ? `Temp ${v.temperatureC}°C` : null,
    v.pulseRate ? `PR ${v.pulseRate}` : null,
    v.respiratoryRate ? `RR ${v.respiratoryRate}` : null,
    v.oxygenSaturation ? `O2 Sat ${v.oxygenSaturation}%` : null,
    v.heightCm ? `Ht ${v.heightCm}cm` : null,
    v.weightKg ? `Wt ${v.weightKg}kg` : null,
    v.bmi ? `BMI ${v.bmi}` : null,
  ].filter(Boolean).join("   ") || "—";
}

function noteTypeLabel(noteType: string): string {
  return `${noteType.charAt(0)}${noteType.slice(1).toLowerCase()}'s Notes`;
}

function sectionTitle(section: ReportSection): string {
  switch (section.kind) {
    case "NOTES": return noteTypeLabel(section.noteType);
    case "MEDICATIONS": return "Medications Administered";
    case "APE": return "Annual Physical Exams";
    case "VITALS": return "Vitals";
    case "DRUG_TEST": return "Drug Test Results";
    case "PRE_EMPLOYMENT": return "Pre-Employment Exams";
  }
}

function sectionEmptyMessage(section: ReportSection): string {
  switch (section.kind) {
    case "NOTES": return "No notes recorded in this period.";
    case "MEDICATIONS": return "No medications logged in this period.";
    case "APE": return "No APE records in this period.";
    case "VITALS": return "No vitals recorded in this period.";
    case "DRUG_TEST": return "No drug test results in this period.";
    case "PRE_EMPLOYMENT": return "No pre-employment exams in this period.";
  }
}

function sectionIsEmpty(section: ReportSection): boolean {
  switch (section.kind) {
    case "NOTES": return section.notes.length === 0;
    case "MEDICATIONS": return section.medications.length === 0;
    case "APE": return section.apes.length === 0;
    case "VITALS": return section.vitals.length === 0;
    case "DRUG_TEST": return section.drugTests.length === 0;
    case "PRE_EMPLOYMENT": return section.preEmployments.length === 0;
  }
}

function fmt(value: unknown, suffix = ""): string {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${suffix}`;
}

const PAGE_MARGIN = 40;
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2; // US Letter width minus margins

function ensureRoom(doc: PDFKit.PDFDocument, neededHeight: number) {
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (neededHeight > remaining) doc.addPage();
}

function labelValue(doc: PDFKit.PDFDocument, label: string, value: string, x: number, width: number) {
  doc.font("Helvetica-Bold").fontSize(9).text(`${label}: `, x, doc.y, { continued: true, width });
  doc.font("Helvetica").fontSize(9).text(value);
}

// Rough per-entry height estimate used to decide whether to force a page
// break before starting an entry, so a chart entry's border box doesn't get
// awkwardly split across two pages for the common (non-pathological) case.
function estimateNoteHeight(doc: PDFKit.PDFDocument, note: ReportNote): number {
  let height = 90; // header + labeled single-line fields + padding
  if (note.vitals) height += 30;
  const longFields = noteFieldsFor(note).map(([, value]) => value).filter(Boolean) as string[];
  for (const f of longFields) {
    height += doc.heightOfString(f, { width: CONTENT_WIDTH - 20 }) + 16;
  }
  return height + 20;
}

function drawNoteEntry(doc: PDFKit.PDFDocument, note: ReportNote) {
  ensureRoom(doc, estimateNoteHeight(doc, note));
  const startY = doc.y;
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).text(
    `${noteTypeLabel(note.noteType).toUpperCase().replace(/S$/, "")}${note.status === "VOIDED" ? " (VOIDED)" : ""}`,
    left, doc.y, { width: innerWidth }
  );
  doc.moveDown(0.3);

  const col2X = left + innerWidth / 2;
  const rowY1 = doc.y;
  labelValue(doc, "Employee", `${note.employeeName} (${note.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = rowY1;
  labelValue(doc, "Date/Time", note.visitDateTime.toLocaleString(), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);

  const rowY2 = doc.y;
  labelValue(doc, "Department", fmt(note.department), left, innerWidth / 2 - 10);
  doc.y = rowY2;
  labelValue(doc, "Company/Agency", fmt(note.companyName), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);

  labelValue(doc, "Author", note.authorName, left, innerWidth);
  doc.moveDown(0.2);
  labelValue(doc, "Work-related", note.isWorkRelated ? "Yes" : "No", left, innerWidth / 2 - 10);

  if (note.vitals) {
    doc.moveDown(0.3);
    doc.moveTo(left, doc.y).lineTo(left + innerWidth, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
    doc.moveDown(0.2);
    labelValue(doc, "Vitals", vitalsLine(note.vitals), left, innerWidth);
  }

  doc.moveDown(0.3);
  doc.moveTo(left, doc.y).lineTo(left + innerWidth, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.moveDown(0.2);

  for (const [label, value] of noteFieldsFor(note)) {
    if (!value) continue;
    doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, left, doc.y, { width: innerWidth });
    doc.font("Helvetica").fontSize(9).text(value, left, doc.y, { width: innerWidth });
    doc.moveDown(0.3);
  }

  labelValue(doc, "Disposition", fmt(note.disposition ? note.disposition.replace(/_/g, " ") : null), left, innerWidth);

  doc.moveDown(0.4);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.6);
}

function drawMedicationEntry(doc: PDFKit.PDFDocument, m: ReportMedication) {
  ensureRoom(doc, 60);
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;
  const startY = doc.y;
  doc.moveDown(0.3);
  labelValue(doc, "Employee", `${m.employeeName} (${m.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = startY + 0.3 * doc.currentLineHeight();
  labelValue(doc, "Date/Time", m.dispensedAt.toLocaleString(), left + innerWidth / 2, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  const desc = [m.drugName, m.strength, m.dosageForm, m.route, m.frequency].filter(Boolean).join(" ");
  labelValue(doc, "Medication", `${desc}${m.quantityDispensed ? ` (qty ${m.quantityDispensed})` : ""}`, left, innerWidth);
  doc.moveDown(0.2);
  labelValue(doc, "Dispensed by", m.dispensedByName, left, innerWidth / 2 - 10);
  doc.moveDown(0.4);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.5);
}

function drawApeEntry(doc: PDFKit.PDFDocument, ape: ReportApe) {
  ensureRoom(doc, 140);
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;
  const startY = doc.y;

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).text(`ANNUAL PHYSICAL EXAM — ${ape.examYear}`, left, doc.y, { width: innerWidth });
  doc.moveDown(0.3);

  const col2X = left + innerWidth / 2;
  const rowY1 = doc.y;
  labelValue(doc, "Employee", `${ape.employeeName} (${ape.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = rowY1;
  labelValue(doc, "Department", fmt(ape.department), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  labelValue(doc, "Fitness Classification", fmt(ape.fitnessClassification ? ape.fitnessClassification.replace(/_/g, " ") : null), left, innerWidth);
  doc.moveDown(0.3);
  doc.moveTo(left, doc.y).lineTo(left + innerWidth, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.moveDown(0.2);

  for (const [label, value] of apeFieldsFor(ape)) {
    if (!value) continue;
    doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, left, doc.y, { width: innerWidth });
    doc.font("Helvetica").fontSize(9).text(value, left, doc.y, { width: innerWidth });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.2);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.6);
}

function drawVitalsEntry(doc: PDFKit.PDFDocument, v: ReportVitalsRecord) {
  ensureRoom(doc, 80);
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;
  const startY = doc.y;

  doc.moveDown(0.3);
  const col2X = left + innerWidth / 2;
  const rowY1 = doc.y;
  labelValue(doc, "Employee", `${v.employeeName} (${v.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = rowY1;
  labelValue(doc, "Date/Time", v.recordedAt.toLocaleString(), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  labelValue(doc, "Vitals", vitalsLine(v), left, innerWidth);
  doc.moveDown(0.2);
  if (v.bmiCategory) {
    labelValue(doc, "BMI Category", v.bmiCategory.replace(/_/g, " "), left, innerWidth / 2 - 10);
    doc.moveDown(0.2);
  }
  labelValue(doc, "Recorded by", v.recordedByName, left, innerWidth / 2 - 10);
  if (v.remarks) {
    doc.moveDown(0.2);
    labelValue(doc, "Remarks", v.remarks, left, innerWidth);
  }
  doc.moveDown(0.4);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.5);
}

function drawDrugTestEntry(doc: PDFKit.PDFDocument, t: ReportDrugTest) {
  ensureRoom(doc, 90);
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;
  const startY = doc.y;

  doc.moveDown(0.3);
  const col2X = left + innerWidth / 2;
  const rowY1 = doc.y;
  labelValue(doc, "Employee", `${t.employeeName} (${t.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = rowY1;
  labelValue(doc, "Test Date", t.testDate.toLocaleDateString(), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  labelValue(doc, "Result", t.result, left, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  labelValue(doc, "Specimen Type", fmt(t.specimenType), left, innerWidth / 2 - 10);
  doc.y = doc.y - doc.currentLineHeight();
  labelValue(doc, "Lab", fmt(t.labName), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  if (t.remarks) labelValue(doc, "Remarks", t.remarks, left, innerWidth);

  doc.moveDown(0.4);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.5);
}

function preEmploymentFieldsFor(p: ReportPreEmployment): [string, string | null][] {
  return [
    ["Exam Date", p.examDate ? p.examDate.toLocaleDateString() : null],
    ["Provider", p.provider],
    ["Height/Weight", p.heightCm || p.weightKg ? `${p.heightCm ?? "—"}cm / ${p.weightKg ?? "—"}kg` : null],
    ["BMI", p.bmi != null ? String(p.bmi) : null],
    ["Blood Pressure", p.bloodPressure],
    ["Vision OD/OS", p.visionOD || p.visionOS ? `${p.visionOD || "—"} / ${p.visionOS || "—"}` : null],
    ["Hearing", p.hearing],
    ["CBC", p.cbcResult],
    ["Urinalysis", p.urinalysisResult],
    ["Fecalysis", p.fecalysisResult],
    ["Chest X-ray", p.chestXrayResult],
    ["ECG", p.ecgResult],
    ["Drug Test", p.drugTestResult],
    ["Pregnancy Test", p.pregnancyTestResult],
    ["Medical History", p.medicalHistory],
    ["Physical Exam Findings", p.physicalExamFindings],
    ["Other Findings", p.otherFindings],
    ["Significant Findings", p.significantFindings],
    ["Recommendations", p.recommendations],
  ];
}

function drawPreEmploymentEntry(doc: PDFKit.PDFDocument, p: ReportPreEmployment) {
  ensureRoom(doc, 140);
  const left = doc.page.margins.left + 10;
  const innerWidth = CONTENT_WIDTH - 20;
  const startY = doc.y;

  doc.moveDown(0.4);
  doc.font("Helvetica-Bold").fontSize(11).text("PRE-EMPLOYMENT EXAM", left, doc.y, { width: innerWidth });
  doc.moveDown(0.3);

  const col2X = left + innerWidth / 2;
  const rowY1 = doc.y;
  labelValue(doc, "Employee", `${p.employeeName} (${p.employeeCode})`, left, innerWidth / 2 - 10);
  doc.y = rowY1;
  labelValue(doc, "Department", fmt(p.department), col2X, innerWidth / 2 - 10);
  doc.moveDown(0.2);
  labelValue(doc, "Fitness Classification", fmt(p.fitnessClassification ? p.fitnessClassification.replace(/_/g, " ") : null), left, innerWidth);
  doc.moveDown(0.3);
  doc.moveTo(left, doc.y).lineTo(left + innerWidth, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.moveDown(0.2);

  for (const [label, value] of preEmploymentFieldsFor(p)) {
    if (!value) continue;
    doc.font("Helvetica-Bold").fontSize(9).text(`${label}:`, left, doc.y, { width: innerWidth });
    doc.font("Helvetica").fontSize(9).text(value, left, doc.y, { width: innerWidth });
    doc.moveDown(0.3);
  }

  doc.moveDown(0.2);
  const endY = doc.y;
  doc.roundedRect(doc.page.margins.left, startY - 6, CONTENT_WIDTH, endY - startY + 4, 3)
    .lineWidth(0.75).strokeColor("#999999").stroke();
  doc.moveDown(0.6);
}

// A note's vitals aren't a real DB relation (VitalsRecord has no noteId) —
// approximate "vitals if present" by the employee's most recent same-day
// reading, preferring one taken at or before the visit time.
export function pickVitalsForNote(
  vitalsInRange: { employeeId: string; recordedAt: Date; heightCm: number | null; weightKg: number | null; bmi: number | null; systolic: number | null; diastolic: number | null; pulseRate: number | null; respiratoryRate: number | null; temperatureC: number | null; oxygenSaturation: number | null }[],
  employeeId: string,
  visitDateTime: Date
): ReportVitalsSnapshot | null {
  const dayStr = visitDateTime.toISOString().slice(0, 10);
  const sameDay = vitalsInRange.filter((v) => v.employeeId === employeeId && v.recordedAt.toISOString().slice(0, 10) === dayStr);
  if (sameDay.length === 0) return null;
  const atOrBefore = sameDay.filter((v) => v.recordedAt <= visitDateTime);
  return atOrBefore.length ? atOrBefore[atOrBefore.length - 1] : sameDay[0];
}

export function buildReportPdf(opts: {
  appName: string;
  title: string;
  subtitleLines: string[];
  sections: ReportSection[];
}): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "LETTER", margin: PAGE_MARGIN, bufferPages: true });

  // Sourced from ClinicSettings (Admin > Settings > Branding) via
  // getAppName() — the same single value used across the UI, never a
  // separate env-var fallback, so a name change here always matches what's
  // printed.
  doc.font("Helvetica-Bold").fontSize(18).text(opts.appName, { align: "center" });
  doc.font("Helvetica-Bold").fontSize(14).text(opts.title, { align: "center" });
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10);
  for (const line of opts.subtitleLines) doc.text(line, { align: "center" });
  doc.moveDown(1);

  // The first section continues right below the header on page 1 — only
  // subsequent sections start a fresh page. Unconditionally calling
  // addPage() here pushed the first section onto page 2 every time,
  // leaving page 1 almost entirely blank below the header.
  let isFirstSection = true;
  for (const section of opts.sections) {
    if (!isFirstSection) doc.addPage();
    isFirstSection = false;
    doc.font("Helvetica-Bold").fontSize(14).text(sectionTitle(section), { underline: true });
    doc.moveDown(0.4);
    if (sectionIsEmpty(section)) {
      doc.font("Helvetica").fontSize(10).text(sectionEmptyMessage(section));
      continue;
    }
    switch (section.kind) {
      case "NOTES":
        for (const note of section.notes) drawNoteEntry(doc, note);
        break;
      case "MEDICATIONS":
        for (const m of section.medications) drawMedicationEntry(doc, m);
        break;
      case "APE":
        for (const a of section.apes) drawApeEntry(doc, a);
        break;
      case "VITALS":
        for (const v of section.vitals) drawVitalsEntry(doc, v);
        break;
      case "DRUG_TEST":
        for (const t of section.drugTests) drawDrugTestEntry(doc, t);
        break;
      case "PRE_EMPLOYMENT":
        for (const p of section.preEmployments) drawPreEmploymentEntry(doc, p);
        break;
    }
  }

  doc.end();
  return doc;
}
