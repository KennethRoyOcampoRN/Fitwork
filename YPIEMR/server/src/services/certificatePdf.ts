import fs from "fs";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { getAppName } from "./appSettings";
import { effectiveCertificatePrefix } from "./certificatePrefix";

export interface CertificateBranding {
  appName: string;
  address: string | null;
  contactNumber: string | null;
  logoBuffer: Buffer | null;
  certificatePrefix: string;
}

// Parallels reportDocx.ts's getAppBranding(), extended with the letterhead
// fields (address/contact number) and the resolved control-number prefix a
// certificate needs but a Word report doesn't.
export async function getCertificateBranding(): Promise<CertificateBranding> {
  const appName = await getAppName();
  const settings = await prisma.clinicSettings.findUnique({ where: { id: "singleton" } });
  let logoBuffer: Buffer | null = null;
  if (settings?.logoPath && fs.existsSync(settings.logoPath)) {
    try {
      logoBuffer = fs.readFileSync(settings.logoPath);
    } catch {
      logoBuffer = null;
    }
  }
  return {
    appName,
    address: settings?.address ?? null,
    contactNumber: settings?.contactNumber ?? null,
    logoBuffer,
    certificatePrefix: effectiveCertificatePrefix(settings?.certificatePrefix, appName),
  };
}

export interface CertificateContent {
  controlNumber: string;
  issuedAt: Date; // top-right "Date:" — when this document was generated, not editable
  examDate: Date; // the "was examined/treated on ___" date — doctor-entered, may predate issuedAt
  name: string;
  address: string;
  complaints: string;
  diagnosis: string;
  remarks: string;
  doctorName: string;
  doctorTitle: string; // "Company Physician" | "Dentist"
}

const PAGE_MARGIN = 56;
const CONTENT_WIDTH = 612 - PAGE_MARGIN * 2; // US Letter width minus margins

// Single-page medical certificate matching the clinic's paper template.
// Deliberately its own renderer, not folded into reportPdf.ts's
// buildReportPdf: that engine is shaped around "many dated entries across
// sections" (notes, APE records, etc.); a certificate is one fixed-format
// letter where every line's exact wording matters, closer to filling in a
// form than compiling a report.
export function buildCertificatePdf(branding: CertificateBranding, content: CertificateContent): PDFKit.PDFDocument {
  const doc = new PDFDocument({ size: "LETTER", margin: PAGE_MARGIN, bufferPages: true });

  // ── Letterhead: logo (if configured) + clinic name/address/contact ────
  const headerTop = doc.y;
  let textLeft = PAGE_MARGIN;
  if (branding.logoBuffer) {
    try {
      doc.image(branding.logoBuffer, PAGE_MARGIN, headerTop, { fit: [64, 64] });
      textLeft = PAGE_MARGIN + 76;
    } catch {
      // Corrupt/unsupported logo data shouldn't block certificate issuance
      // — fall back to a text-only letterhead, same as no logo configured.
    }
  }
  const headerWidth = CONTENT_WIDTH - (textLeft - PAGE_MARGIN);
  doc.font("Helvetica-Bold").fontSize(16).text(branding.appName, textLeft, headerTop, { width: headerWidth });
  doc.font("Helvetica").fontSize(9);
  if (branding.address) doc.text(branding.address, textLeft, doc.y, { width: headerWidth });
  if (branding.contactNumber) doc.text(branding.contactNumber, textLeft, doc.y, { width: headerWidth });

  doc.y = Math.max(doc.y, headerTop + 64) + 10;
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y).lineWidth(1).strokeColor("#333333").stroke();
  doc.moveDown(1.2);

  // ── Title, date, control number ────────────────────────────────────
  const titleY = doc.y;
  doc.font("Helvetica-Bold").fontSize(14).text("MEDICAL CERTIFICATE", PAGE_MARGIN, titleY, { width: CONTENT_WIDTH * 0.6 });
  doc.font("Helvetica").fontSize(9)
    .text(`Date: ${content.issuedAt.toLocaleDateString()}`, PAGE_MARGIN, titleY, { width: CONTENT_WIDTH, align: "right" });
  doc.text(`Control No.: ${content.controlNumber}`, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: "right" });
  doc.y = Math.max(doc.y, titleY + 22);
  doc.moveDown(1.2);

  // ── Body ────────────────────────────────────────────────────────────
  doc.font("Helvetica").fontSize(11).fillColor("#000000");
  doc.text("To Whom It May Concern:", PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(1);

  // Certify paragraph flows directly into the complaints/P.E. findings
  // text with only normal paragraph spacing — no blank or underlined line,
  // per the feature spec (this is a generated, typed document, not a form
  // to be filled in by hand later).
  doc.text(
    `THIS IS TO CERTIFY that ${content.name} of ${content.address}, was examined/treated on ` +
    `${content.examDate.toLocaleDateString()} with the following complaints/P.E. FINDINGS:`,
    PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: "justify" }
  );
  doc.moveDown(0.4);
  doc.text(content.complaints, PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH, align: "justify" });
  doc.moveDown(1);

  // DIAGNOSIS/REMARKS start on the same line as their label (continued:
  // true), matching the template's single-line "Label: ___" convention —
  // long text wraps naturally onto following lines as a continuation of
  // the same paragraph, still with no blank line ever inserted.
  doc.font("Helvetica-Bold").text("DIAGNOSIS: ", PAGE_MARGIN, doc.y, { continued: true, width: CONTENT_WIDTH });
  doc.font("Helvetica").text(content.diagnosis, { width: CONTENT_WIDTH, align: "justify" });
  doc.moveDown(1);

  doc.font("Helvetica-Bold").text("REMARKS: ", PAGE_MARGIN, doc.y, { continued: true, width: CONTENT_WIDTH });
  doc.font("Helvetica").text(content.remarks, { width: CONTENT_WIDTH, align: "justify" });

  // ── Signature block + disclaimer ───────────────────────────────────
  // Deliberately positioned via doc.y picking up exactly where the content
  // flow above left off — never a fixed Y-coordinate. This is the
  // anti-tampering measure the feature spec calls for: a fixed position
  // would leave exploitable blank space between Remarks and the signature
  // on a short certificate, which is exactly where fabricated content
  // could be inserted undetected on a scanned/edited copy. Letting the
  // layout hug the actual content length removes that gap entirely.
  doc.moveDown(2.5);
  const sigLineY = doc.y;
  doc.moveTo(PAGE_MARGIN, sigLineY).lineTo(PAGE_MARGIN + 200, sigLineY).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.font("Helvetica-Bold").fontSize(10).text(content.doctorName, PAGE_MARGIN, sigLineY + 4, { width: 220 });
  doc.font("Helvetica").fontSize(9).text("MD", PAGE_MARGIN, doc.y, { width: 220 });
  doc.text(content.doctorTitle, PAGE_MARGIN, doc.y, { width: 220 });

  doc.moveDown(1);
  doc.font("Helvetica-Oblique").fontSize(8).fillColor("#444444").text(
    "*This certificate is issued upon request of the above patient for whatever purpose it may serve. Not for medico-legal purposes.",
    PAGE_MARGIN, doc.y, { width: CONTENT_WIDTH }
  );

  doc.end();
  return doc;
}
