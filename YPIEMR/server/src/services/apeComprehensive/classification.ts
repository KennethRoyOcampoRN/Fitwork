// Central occupational-health classification config for the APE
// Comprehensive report — every band lives here, nowhere else, so the
// narrative/chart/stats modules never hardcode a threshold themselves.
//
// Data-model note (flagged explicitly, not silently assumed): AnnualPhysicalExam
// stores blood pressure, visual acuity, and hearing as single free-text
// fields (e.g. "120/80", "20/20", "Normal") — there is no structured
// per-ear audiometry (dB by frequency) and no color-vision field at all.
// Real audiometric/color-vision classification would need those as
// structured numeric/enum data. Rather than block this report on a schema
// change, the parsers below work within the existing free text: they
// extract what they can (a blood-pressure pair, a Snellen fraction, a
// keyword or dB number for hearing) and classify only what parses cleanly;
// anything else is tallied as an unclassifiable recorded value, never
// dropped or guessed at. Color vision has no section at all — the Data
// Completeness appendix says so explicitly instead of fabricating one.

export type Band = { label: string; description: string };

// ── BMI — Asia-Pacific WHO cutoffs (kg/m²) ──────────────────────────────
export const BMI_BANDS: (Band & { min: number; max: number })[] = [
  { label: "Underweight", description: "BMI below 18.5", min: -Infinity, max: 18.5 },
  { label: "Normal", description: "BMI 18.5–22.9", min: 18.5, max: 23 },
  { label: "Overweight (at risk)", description: "BMI 23.0–24.9", min: 23, max: 25 },
  { label: "Obese I", description: "BMI 25.0–29.9", min: 25, max: 30 },
  { label: "Obese II", description: "BMI 30.0 and above", min: 30, max: Infinity },
];

export function classifyBmi(bmi: number): Band | null {
  if (!Number.isFinite(bmi)) return null;
  return BMI_BANDS.find((b) => bmi >= b.min && bmi < b.max) ?? null;
}

// ── Blood pressure — ACC/AHA 2017 staging (mmHg) ────────────────────────
export const BP_BANDS: Band[] = [
  { label: "Normal", description: "Systolic <120 and diastolic <80" },
  { label: "Elevated", description: "Systolic 120–129 and diastolic <80" },
  { label: "Hypertension Stage 1", description: "Systolic 130–139 or diastolic 80–89" },
  { label: "Hypertension Stage 2", description: "Systolic ≥140 or diastolic ≥90" },
  { label: "Hypertensive Crisis", description: "Systolic >180 and/or diastolic >120 — flagged for immediate review" },
];

export interface ParsedBloodPressure { systolic: number; diastolic: number }

export function parseBloodPressure(raw: string): ParsedBloodPressure | null {
  const match = raw.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (!match) return null;
  const systolic = Number(match[1]);
  const diastolic = Number(match[2]);
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  return { systolic, diastolic };
}

export function classifyBloodPressure(bp: ParsedBloodPressure): Band {
  const { systolic, diastolic } = bp;
  if (systolic > 180 || diastolic > 120) return BP_BANDS[4];
  if (systolic >= 140 || diastolic >= 90) return BP_BANDS[3];
  if (systolic >= 130 || diastolic >= 80) return BP_BANDS[2];
  if (systolic >= 120 && diastolic < 80) return BP_BANDS[1];
  return BP_BANDS[0];
}

// ── Visual acuity — Snellen fraction (either eye) ───────────────────────
export const VISUAL_ACUITY_BANDS: Band[] = [
  { label: "Normal", description: "20/25 or better" },
  { label: "Mild impairment", description: "20/30 to 20/40" },
  { label: "Moderate impairment", description: "20/50 to 20/60" },
  { label: "Severe impairment", description: "20/70 to 20/160" },
  { label: "Profound impairment", description: "Worse than 20/160" },
];

export function parseSnellen(raw: string): number | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const numerator = Number(match[1]);
  const denominator = Number(match[2]);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator; // 1.0 = 20/20; smaller = worse
}

export function classifyVisualAcuity(ratio: number): Band {
  if (ratio >= 0.8) return VISUAL_ACUITY_BANDS[0];
  if (ratio >= 0.5) return VISUAL_ACUITY_BANDS[1];
  if (ratio >= 0.33) return VISUAL_ACUITY_BANDS[2];
  if (ratio >= 0.125) return VISUAL_ACUITY_BANDS[3];
  return VISUAL_ACUITY_BANDS[4];
}

// ── Audiometry — WHO grades of hearing impairment (dB HL) ──────────────
// The "hearing" field is free text, not a measured dB average, so this is
// used only when a dB figure or an unambiguous severity keyword is present
// in that text (see parseHearing) — everything else falls back to a plain
// tally of the recorded text, same as the non-classifiable lab fields.
// AUDIOMETRY_BANDS is ordered Normal→Profound (ascending severity) — that
// order is load-bearing for classifyHearing's "worst band wins" logic
// below, not just presentation order.
export const AUDIOMETRY_BANDS: (Band & { keyword: RegExp; maxDb: number })[] = [
  { label: "Normal", description: "≤25 dB HL", keyword: /\bnormal\b|\bhearing intact\b|\bwhisper test passed\b/i, maxDb: 25 },
  { label: "Mild hearing loss", description: "26–40 dB HL", keyword: /\bmild\b/i, maxDb: 40 },
  { label: "Moderate hearing loss", description: "41–60 dB HL", keyword: /\bmoderate\b/i, maxDb: 60 },
  { label: "Severe hearing loss", description: "61–80 dB HL", keyword: /\bsevere\b/i, maxDb: 80 },
  { label: "Profound hearing loss", description: ">80 dB HL", keyword: /\bprofound\b/i, maxDb: Infinity },
];

// Returns the WORST band with any signal present in the text — not the
// first one matched — so a mixed finding like "Normal right ear, mild
// hearing loss left ear" classifies as Mild, not Normal. A dB figure and a
// severity keyword are both checked and the more severe of the two wins;
// only when NEITHER produces a match does this return null (unclassifiable).
// Residual limitation, not fixed here: a keyword can still be a false
// positive on unrelated context (e.g. "mild wax buildup" attaches "mild" to
// cerumen, not a hearing grade) — same free-text ambiguity as any
// unstructured field, not something a regex can fully resolve.
export function classifyHearing(raw: string): Band | null {
  let worstIndex = -1;

  const dbMatch = raw.match(/(\d+(?:\.\d+)?)\s*db/i);
  if (dbMatch) {
    const db = Number(dbMatch[1]);
    if (Number.isFinite(db)) {
      const idx = AUDIOMETRY_BANDS.findIndex((b) => db <= b.maxDb);
      if (idx !== -1) worstIndex = Math.max(worstIndex, idx);
    }
  }

  AUDIOMETRY_BANDS.forEach((b, idx) => {
    if (b.keyword.test(raw)) worstIndex = Math.max(worstIndex, idx);
  });

  return worstIndex === -1 ? null : AUDIOMETRY_BANDS[worstIndex];
}

// Below this many recorded values, percentages and trend language are
// suppressed in favor of plain counts — a rate computed from 3 people is
// not meaningful and reads as false precision.
export const SMALL_N_THRESHOLD = 5;

// Components whose tally labels come from THIS file's controlled band
// vocabulary (so "Normal" is a real, known label, not just whatever text an
// examiner happened to type). Chest X-ray/CBC/urinalysis/fecalysis/ECG are
// free-text lab fields with no controlled vocabulary — a top value like "No
// active disease" or "Within normal limits" IS effectively normal, but
// there's no reliable way to detect that from arbitrary free text, so
// "is this non-normal?" logic (executive summary highlights, draft
// recommendations, per-company key findings) is restricted to these keys
// only. The per-component narrative still reports free-text fields' top
// value honestly — it just never asserts that value is or isn't normal.
export const CLASSIFIED_COMPONENT_KEYS = new Set(["bmi", "bp", "visualAcuity", "audiometry"]);
