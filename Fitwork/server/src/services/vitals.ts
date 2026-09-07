// Each vitals check-in is its own immutable row (VitalsRecord.create is the
// only write path — there is no update/patch endpoint at all), so recording
// a new reading can never overwrite or corrupt an earlier one in the
// database. But a nurse rarely re-enters every field every time — one visit
// might only take Weight, another only Blood Pressure — so "the employee's
// current vitals" has to be assembled by looking back through history for
// the most recent *known* value of each field independently, not by taking
// the single newest row wholesale. Taking the newest row wholesale (the
// previous behavior) made it look like saving a Weight-only reading had
// deleted a previously recorded Blood Pressure, when the BP row was still
// there all along — this is a display bug, not a data-loss bug, but it
// reads as one to whoever's looking at the employee's profile.
const MERGEABLE_FIELDS = [
  "heightCm",
  "weightKg",
  "bmi",
  "bmiCategory",
  "systolic",
  "diastolic",
  "pulseRate",
  "respiratoryRate",
  "temperatureC",
  "oxygenSaturation",
  "remarks",
] as const;

type MergeableField = (typeof MERGEABLE_FIELDS)[number];
type MergeSource = { recordedAt: Date } & Partial<Record<MergeableField, unknown>>;

export type MergedVitals = { recordedAt: Date } & Record<MergeableField, unknown>;

// `records` must already be ordered most-recent-first (recordedAt desc).
export function mergeLatestVitals<T extends MergeSource>(records: T[]): MergedVitals | null {
  if (records.length === 0) return null;

  const merged = { recordedAt: records[0].recordedAt } as MergedVitals;
  for (const field of MERGEABLE_FIELDS) {
    merged[field] = null;
    for (const record of records) {
      const value = record[field];
      if (value !== null && value !== undefined) {
        merged[field] = value;
        break;
      }
    }
  }
  return merged;
}
