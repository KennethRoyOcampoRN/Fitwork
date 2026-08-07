// Live-suggestion counterpart to server/src/services/certificatePrefix.ts's
// deriveCertificatePrefix — deliberately duplicated rather than imported
// (client and server are separate npm workspaces with no shared package in
// this repo, and AdminBranding.tsx already duplicates the other branding
// defaults, e.g. DEFAULT_PRIMARY_COLOR, the same way). Keep this in sync
// with the server version if the derivation rule ever changes.

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
  const chosen = significant.length >= 2 ? significant : words;
  const initials = chosen.map(firstLetter).filter(Boolean).join("").slice(0, 6);

  if (initials.length >= 2) return initials;
  const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
  return longest.replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase();
}
