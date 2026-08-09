// Minimal CSV writer shared by the month/year report exports (see
// routes/reportsCsv.ts) — same escaping convention already used ad hoc in
// routes/audit.ts's export.csv, pulled out here since four report endpoints
// need it instead of just one.
export function csvEscape(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}
