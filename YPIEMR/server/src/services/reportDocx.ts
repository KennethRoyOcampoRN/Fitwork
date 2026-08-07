import fs from "fs";
import {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, WidthType, BorderStyle,
} from "docx";
import { Response } from "express";
import { prisma } from "../lib/prisma";
import { getAppName } from "./appSettings";

// Word-document counterpart to reportPdf.ts's buildReportPdf — same
// "single shared engine, callers assemble content" shape, but for editable
// .docx exports (Word reports) instead of pdfkit PDFs. docx's document model
// is declarative (a Document is built from a tree of content nodes, not
// drawn imperatively like pdfkit), so this service exposes small builder
// helpers rather than a fixed set of section "kinds."

export interface AppBranding {
  appName: string;
  logoBuffer: Buffer | null;
}

export async function getAppBranding(): Promise<AppBranding> {
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
  return { appName, logoBuffer };
}

// Standard report header: logo (if configured) + appName + report title +
// subtitle lines (period, filters, generated-by stamp, etc.).
export function docHeader(branding: AppBranding, title: string, subtitleLines: string[]): Paragraph[] {
  const paragraphs: Paragraph[] = [];

  if (branding.logoBuffer) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ data: branding.logoBuffer, transformation: { width: 72, height: 72 }, type: "png" })],
    }));
  }

  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: branding.appName, bold: true, size: 32 })],
  }));

  paragraphs.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: title, bold: true, size: 26 })],
    spacing: { after: 120 },
  }));

  for (const line of subtitleLines) {
    paragraphs.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: line, size: 20, color: "555555" })],
    }));
  }

  paragraphs.push(new Paragraph({ text: "", spacing: { after: 200 } }));

  return paragraphs;
}

export function sectionHeading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 150 } });
}

export function subHeading(text: string): Paragraph {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } });
}

export function emptyMessage(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, italics: true, color: "888888" })], spacing: { after: 200 } });
}

const CELL_BORDER = { style: BorderStyle.SINGLE, size: 2, color: "CCCCCC" };
const CELL_BORDERS = { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER };

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })],
    shading: { fill: "E5EDFB" },
    borders: CELL_BORDERS,
  });
}

function bodyCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text: text || "—", size: 18 })] })],
    borders: CELL_BORDERS,
  });
}

// A plain data table — headers + rows of strings — used for both summary
// counts and detailed per-employee/per-note listings across every new
// report in this feature.
export function dataTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: headers.map(headerCell), tableHeader: true }),
      ...rows.map((r) => new TableRow({ children: r.map(bodyCell) })),
    ],
  });
}

export async function sendDocx(res: Response, filename: string, children: (Paragraph | Table)[]): Promise<void> {
  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  const buffer = await Packer.toBuffer(doc);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(buffer);
}
