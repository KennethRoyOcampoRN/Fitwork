// Minimal magic-byte sniffing so uploads are validated by content, not filename extension.
const SIGNATURES: { mime: string; bytes: number[]; offset?: number }[] = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF....WEBP
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] }, // xlsx/docx are zip containers
];

export function sniffMime(buf: Buffer): string | null {
  for (const sig of SIGNATURES) {
    const offset = sig.offset ?? 0;
    if (buf.length < offset + sig.bytes.length) continue;
    const match = sig.bytes.every((b, i) => buf[offset + i] === b);
    if (match) {
      if (sig.mime === "image/webp") {
        const isWebp = buf.slice(8, 12).toString("ascii") === "WEBP";
        if (!isWebp) continue;
      }
      return sig.mime;
    }
  }
  return null;
}

const ALLOWED_ZIP_EXTENSIONS = new Set(["xlsx", "xls", "docx"]);

export function isAllowedUpload(buf: Buffer, extension: string): boolean {
  const mime = sniffMime(buf);
  if (!mime) return false;
  if (mime === "application/zip") return ALLOWED_ZIP_EXTENSIONS.has(extension.toLowerCase());
  return true;
}
