// Mirrors the server's TOOTH_STATUSES (routes/dental.ts) — a plain string
// column, not a native enum, so adding more statuses later (filled, crown,
// root canal, etc.) means adding an entry here and there, not a migration.
export const TOOTH_STATUS_OPTIONS = [
  { value: "HEALTHY", label: "Healthy" },
  { value: "MISSING", label: "Missing (extracted)" },
  { value: "CARIES", label: "Caries" },
] as const;

export type ToothStatus = (typeof TOOTH_STATUS_OPTIONS)[number]["value"];

export const TOOTH_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  TOOTH_STATUS_OPTIONS.map((o) => [o.value, o.label])
);

// Universal Numbering System, 1-32. Upper arch = 1-16 (patient's right
// third molar through patient's left third molar), lower arch = 17-32
// (patient's left third molar through patient's right third molar) — the
// standard "facing the patient" chart orientation, so both arches read
// left-to-right on screen the same way a printed dental chart does.
export const UPPER_TEETH = Array.from({ length: 16 }, (_, i) => i + 1);
export const LOWER_TEETH = Array.from({ length: 16 }, (_, i) => i + 17);
