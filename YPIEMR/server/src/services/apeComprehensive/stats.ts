import {
  classifyBmi, classifyBloodPressure, parseBloodPressure,
  classifyVisualAcuity, parseSnellen, classifyHearing, SMALL_N_THRESHOLD,
} from "./classification";

// Pure data aggregation — takes raw rows, produces the structured stats the
// narrative and chart modules consume. No docx/canvas code, no sentence
// text, so this can be unit-reasoned-about (and tested) independently of
// how it's eventually rendered.

export interface ApeExamRow {
  employeeId: string;
  examYear: number;
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
  otherFindings: string | null;
  significantFindings: string | null;
  fitnessClassification: string | null;
}

export interface ToothSummary {
  employeeId: string;
  healthy: number;
  missing: number;
  caries: number;
}

export interface ScopedEmployee {
  id: string;
  employeeCode: string;
  lastName: string;
  firstName: string;
  dateOfBirth: Date | null;
  sex: string | null;
  department: string | null;
  dateHired: Date | null;
  companyId: string | null;
  companyName: string | null;
}

export interface Tally { label: string; count: number }

// A single component's stats — shared shape for both classified fields
// (BMI, BP, visual acuity, hearing — tally is band labels) and free-text
// fields (labs — tally is normalized recorded values). recordedCount is
// ALWAYS the percentage denominator, never totalExamined — the two are
// reported side by side so a reader never mistakes one for the other.
export interface ComponentStat {
  key: string;
  label: string;
  totalExamined: number;
  recordedCount: number;
  tally: Tally[];
  unclassifiableCount: number; // recorded but couldn't be parsed into a band; 0 for free-text tallies (everything recorded is "classified" as itself)
}

export interface DemographicBreakdown {
  key: string;
  label: string;
  tally: Tally[];
}

export interface FollowUpItem {
  employeeCode: string;
  employeeName: string;
  urgency: "High" | "Medium" | "Low";
  reason: string;
  componentKey: string; // lets each component section show only its own follow-ups, alongside the full grouped-by-urgency list in its own section
}

export interface CompletenessRow {
  field: string;
  recorded: number;
  missing: number;
}

export interface CompanyBreakdown {
  companyId: string | null;
  companyName: string;
  headcount: number;
  examined: number;
  keyFindings: string[]; // short bullet-style summaries, e.g. "3 of 12 examined have Stage 2 hypertension"
}

export interface ApeComprehensiveStats {
  year: number;
  headcount: number;
  examined: number;
  demographics: DemographicBreakdown[];
  components: ComponentStat[];
  dental: ComponentStat;
  followUps: FollowUpItem[];
  completeness: CompletenessRow[];
  companyBreakdown: CompanyBreakdown[] | null;
}

export interface YearOverYearComponent {
  key: string;
  label: string;
  years: { year: number; hasData: boolean; recordedCount: number; tally: Tally[] }[];
}

function normalizeText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "Unspecified";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function tallyToSorted(map: Map<string, number>): Tally[] {
  return Array.from(map.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

// Classifies a set of raw values (one per examined employee, null when not
// recorded) using `classify`, which may return null for "recorded but
// couldn't be parsed" — those are tallied separately, never silently
// dropped or guessed into the nearest band.
function classifiedComponentStat(
  key: string, label: string, totalExamined: number,
  rawValues: (string | number | null)[],
  classify: (v: string | number) => { label: string } | null,
): ComponentStat {
  const tallyMap = new Map<string, number>();
  let recordedCount = 0;
  let unclassifiableCount = 0;
  for (const raw of rawValues) {
    if (raw === null || raw === undefined || raw === "") continue;
    recordedCount++;
    const band = classify(raw);
    if (band) tallyMap.set(band.label, (tallyMap.get(band.label) ?? 0) + 1);
    else unclassifiableCount++;
  }
  return { key, label, totalExamined, recordedCount, tally: tallyToSorted(tallyMap), unclassifiableCount };
}

function freeTextComponentStat(key: string, label: string, totalExamined: number, rawValues: (string | null)[]): ComponentStat {
  const tallyMap = new Map<string, number>();
  let recordedCount = 0;
  for (const raw of rawValues) {
    if (raw === null || raw === undefined || raw.trim() === "") continue;
    recordedCount++;
    const normalized = normalizeText(raw);
    tallyMap.set(normalized, (tallyMap.get(normalized) ?? 0) + 1);
  }
  return { key, label, totalExamined, recordedCount, tally: tallyToSorted(tallyMap), unclassifiableCount: 0 };
}

export function buildComponentStats(exams: ApeExamRow[]): ComponentStat[] {
  const n = exams.length;
  const bmiStat = classifiedComponentStat("bmi", "Anthropometrics / BMI", n, exams.map((e) => e.bmi), (v) => classifyBmi(Number(v)));

  const bpStat = classifiedComponentStat("bp", "Blood Pressure", n, exams.map((e) => e.bloodPressure), (v) => {
    const parsed = parseBloodPressure(String(v));
    return parsed ? classifyBloodPressure(parsed) : null;
  });

  // Visual acuity: the worse (lower ratio) of the two eyes represents the
  // employee in the classification tally — a single figure per person, not
  // one entry per eye, so the denominator stays "employees examined" rather
  // than "eyes examined."
  const acuityRaw = exams.map((e) => {
    const od = e.visionOD ? parseSnellen(e.visionOD) : null;
    const os = e.visionOS ? parseSnellen(e.visionOS) : null;
    if (od === null && os === null) return e.visionOD || e.visionOS || null;
    const worse = [od, os].filter((v): v is number => v !== null).sort((a, b) => a - b)[0];
    return worse;
  });
  const acuityStat = classifiedComponentStat("visualAcuity", "Visual Acuity", n, acuityRaw, (v) =>
    typeof v === "number" ? classifyVisualAcuity(v) : null);

  const hearingStat = classifiedComponentStat("audiometry", "Audiometry", n, exams.map((e) => e.hearing), (v) => classifyHearing(String(v)));

  const chestXray = freeTextComponentStat("chestXray", "Chest X-ray", n, exams.map((e) => e.chestXrayResult));
  const cbc = freeTextComponentStat("cbc", "CBC", n, exams.map((e) => e.cbcResult));
  const urinalysis = freeTextComponentStat("urinalysis", "Urinalysis", n, exams.map((e) => e.urinalysisResult));
  const fecalysis = freeTextComponentStat("fecalysis", "Fecalysis", n, exams.map((e) => e.fecalysisResult));
  const ecg = freeTextComponentStat("ecg", "ECG", n, exams.map((e) => e.ecgResult));

  return [bmiStat, bpStat, acuityStat, hearingStat, chestXray, cbc, urinalysis, fecalysis, ecg];
}

function ageOn(dateOfBirth: Date, asOf: Date): number {
  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const hadBirthday = asOf.getMonth() > dateOfBirth.getMonth() || (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() >= dateOfBirth.getDate());
  if (!hadBirthday) age--;
  return age;
}

const AGE_BRACKETS: [string, number, number][] = [
  ["Under 20", 0, 19], ["20-29", 20, 29], ["30-39", 30, 39], ["40-49", 40, 49], ["50-59", 50, 59], ["60+", 60, 999],
];
const TENURE_BRACKETS: [string, number, number][] = [
  ["Under 1 year", 0, 0], ["1-3 years", 1, 3], ["3-5 years", 3, 5], ["5-10 years", 5, 10], ["10+ years", 10, 999],
];

function bracketFor(value: number, brackets: [string, number, number][]): string {
  const b = brackets.find(([, min, max]) => value >= min && value < max) ?? brackets.find(([, min, max]) => value >= min && value <= max);
  return b ? b[0] : "Unknown";
}

export function buildDemographics(employees: ScopedEmployee[], asOf: Date): DemographicBreakdown[] {
  const ageTally = new Map<string, number>();
  const sexTally = new Map<string, number>();
  const deptTally = new Map<string, number>();
  const tenureTally = new Map<string, number>();

  for (const e of employees) {
    if (e.dateOfBirth) {
      const bracket = bracketFor(ageOn(e.dateOfBirth, asOf), AGE_BRACKETS);
      ageTally.set(bracket, (ageTally.get(bracket) ?? 0) + 1);
    }
    const sex = e.sex || "Unspecified";
    sexTally.set(sex, (sexTally.get(sex) ?? 0) + 1);
    const dept = e.department || "(No department)";
    deptTally.set(dept, (deptTally.get(dept) ?? 0) + 1);
    if (e.dateHired) {
      const years = (asOf.getTime() - e.dateHired.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      const bracket = bracketFor(years, TENURE_BRACKETS);
      tenureTally.set(bracket, (tenureTally.get(bracket) ?? 0) + 1);
    }
  }

  return [
    { key: "age", label: "Age", tally: tallyToSorted(ageTally) },
    { key: "sex", label: "Sex", tally: tallyToSorted(sexTally) },
    { key: "department", label: "Department", tally: tallyToSorted(deptTally) },
    { key: "tenure", label: "Length of Service", tally: tallyToSorted(tenureTally) },
  ];
}

// A follow-up flag describes/classifies risk bands for review — it never
// states a diagnosis or recommends treatment (see classification.ts's
// comment and the report's Recommendations section, which is explicitly a
// human-editable draft rather than this module's output).
export function buildFollowUps(exams: ApeExamRow[], employeesById: Map<string, ScopedEmployee>): FollowUpItem[] {
  const items: FollowUpItem[] = [];
  for (const e of exams) {
    const emp = employeesById.get(e.employeeId);
    if (!emp) continue;
    const employeeName = `${emp.lastName}, ${emp.firstName}`;
    const reasons: { urgency: FollowUpItem["urgency"]; reason: string; componentKey: string }[] = [];

    if (e.bloodPressure) {
      const bp = parseBloodPressure(e.bloodPressure);
      if (bp) {
        const band = classifyBloodPressure(bp);
        if (band.label === "Hypertensive Crisis") reasons.push({ urgency: "High", reason: `Blood pressure in the Hypertensive Crisis range (${e.bloodPressure})`, componentKey: "bp" });
        else if (band.label === "Hypertension Stage 2") reasons.push({ urgency: "Medium", reason: `Blood pressure at Hypertension Stage 2 (${e.bloodPressure})`, componentKey: "bp" });
        else if (band.label === "Hypertension Stage 1") reasons.push({ urgency: "Low", reason: `Blood pressure at Hypertension Stage 1 (${e.bloodPressure})`, componentKey: "bp" });
      }
    }
    if (e.bmi !== null) {
      const band = classifyBmi(e.bmi);
      if (band?.label === "Obese II") reasons.push({ urgency: "Medium", reason: `BMI classified as Obese II (${e.bmi.toFixed(1)})`, componentKey: "bmi" });
    }
    const worseAcuity = [e.visionOD, e.visionOS].filter((v): v is string => !!v).map(parseSnellen).filter((v): v is number => v !== null).sort((a, b) => a - b)[0];
    if (worseAcuity !== undefined) {
      const band = classifyVisualAcuity(worseAcuity);
      if (band.label === "Profound impairment" || band.label === "Severe impairment") reasons.push({ urgency: "High", reason: `Visual acuity classified as ${band.label}`, componentKey: "visualAcuity" });
      else if (band.label === "Moderate impairment") reasons.push({ urgency: "Medium", reason: "Visual acuity classified as Moderate impairment", componentKey: "visualAcuity" });
    }
    if (e.hearing) {
      const band = classifyHearing(e.hearing);
      if (band?.label === "Severe hearing loss" || band?.label === "Profound hearing loss") reasons.push({ urgency: "High", reason: `Audiometry classified as ${band.label}`, componentKey: "audiometry" });
      else if (band?.label === "Moderate hearing loss") reasons.push({ urgency: "Medium", reason: "Audiometry classified as Moderate hearing loss", componentKey: "audiometry" });
    }
    if (e.fitnessClassification === "CLASS_D") reasons.push({ urgency: "High", reason: "Fitness classification: Class D", componentKey: "fitness" });
    else if (e.fitnessClassification === "CLASS_C") reasons.push({ urgency: "Medium", reason: "Fitness classification: Class C", componentKey: "fitness" });
    if (e.significantFindings?.trim()) reasons.push({ urgency: "High", reason: `Significant findings on file: "${e.significantFindings.trim()}"`, componentKey: "general" });

    for (const r of reasons) items.push({ employeeCode: emp.employeeCode, employeeName, urgency: r.urgency, reason: r.reason, componentKey: r.componentKey });
  }
  const order = { High: 0, Medium: 1, Low: 2 };
  return items.sort((a, b) => order[a.urgency] - order[b.urgency] || a.employeeName.localeCompare(b.employeeName));
}

const COMPLETENESS_FIELDS: { key: keyof ApeExamRow; label: string }[] = [
  { key: "heightCm", label: "Height" }, { key: "weightKg", label: "Weight" }, { key: "bmi", label: "BMI" },
  { key: "bloodPressure", label: "Blood Pressure" }, { key: "visionOD", label: "Vision (OD)" }, { key: "visionOS", label: "Vision (OS)" },
  { key: "hearing", label: "Hearing" }, { key: "cbcResult", label: "CBC" }, { key: "urinalysisResult", label: "Urinalysis" },
  { key: "fecalysisResult", label: "Fecalysis" }, { key: "chestXrayResult", label: "Chest X-ray" }, { key: "ecgResult", label: "ECG" },
  { key: "fitnessClassification", label: "Fitness Classification" },
];

export function buildCompleteness(exams: ApeExamRow[]): CompletenessRow[] {
  return COMPLETENESS_FIELDS.map(({ key, label }) => {
    const recorded = exams.filter((e) => {
      const v = e[key];
      return v !== null && v !== undefined && String(v).trim() !== "";
    }).length;
    return { field: label, recorded, missing: exams.length - recorded };
  });
}

export function isSmallN(recordedCount: number): boolean {
  return recordedCount < SMALL_N_THRESHOLD;
}

// Dental cross-reference: unlike the other components, the tooth chart is
// current-state-only and independent of APE exam completion (see the
// Dental report's own tooth-chart appendix) — every employee in scope has a
// defined state (a tooth with no ToothRecord row defaults to HEALTHY), so
// the denominator here is the scope's headcount, not the examined count.
// That distinction is called out explicitly in this section's intro text
// in docBuilder.ts, not left implicit.
export function buildDentalStat(employees: ScopedEmployee[], toothByEmployee: Map<string, ToothSummary>): ComponentStat {
  const tallyMap = new Map<string, number>();
  for (const e of employees) {
    const t = toothByEmployee.get(e.id);
    const hasIssue = !!t && (t.missing > 0 || t.caries > 0);
    const label = hasIssue ? "Has dental findings (missing/caries)" : "No dental findings";
    tallyMap.set(label, (tallyMap.get(label) ?? 0) + 1);
  }
  return { key: "dental", label: "Dental Cross-Reference", totalExamined: employees.length, recordedCount: employees.length, tally: tallyToSorted(tallyMap), unclassifiableCount: 0 };
}
