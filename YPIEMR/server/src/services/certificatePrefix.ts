// Derives a suggested certificate control-number prefix from a clinic name,
// e.g. "Acme Philippines Incorporated" -> "API", "FitWork" -> "FITW".
// Mirrored (deliberately duplicated, not imported) in
// client/src/lib/certificatePrefix.ts for the live suggestion shown in the
// branding form — see that file for why this isn't shared code.

const GENERIC_WORDS = new Set([
  "inc", "incorporated", "corp", "corporation", "company", "co",
  "philippines", "ph", "ltd", "llc",
]);

function firstLetter(word: string): string {
  const alnum = word.replace(/[^a-zA-Z0-9]/g, "");
  return alnum ? alnum[0].toUpperCase() : "";
}

export function deriveCertificatePrefix(clinicName: string): string {
  const words = clinicName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";

  if (words.length === 1) {
    return words[0].replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase();
  }

  const significant = words.filter((w) => !GENERIC_WORDS.has(w.toLowerCase().replace(/[.,]/g, "")));
  // Filtering out generic words only helps if it still leaves more than one
  // word to initialize — a single leftover word would collapse to a
  // one-letter prefix, which fails the 2-6 char minimum, so fall back to
  // using every word instead (the spec's own "otherwise just use all words").
  const chosen = significant.length >= 2 ? significant : words;
  const initials = chosen.map(firstLetter).filter(Boolean).join("").slice(0, 6);

  if (initials.length >= 2) return initials;
  // Degenerate case (e.g. every word is 1 char and got truncated to nothing
  // useful): fall back to the single-word rule against the longest word.
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase();
}

const FALLBACK_PREFIX = "CERT";

// The prefix actually used for control numbers: the admin-configured value
// if present, otherwise derived from the clinic name, otherwise a fixed
// last-resort — always normalized to something the numbering format can use.
export function effectiveCertificatePrefix(certificatePrefix: string | null | undefined, appName: string): string {
  if (certificatePrefix && /^[A-Z0-9]{2,6}$/.test(certificatePrefix)) return certificatePrefix;
  const derived = deriveCertificatePrefix(appName);
  return derived.length >= 2 ? derived : FALLBACK_PREFIX;
}
