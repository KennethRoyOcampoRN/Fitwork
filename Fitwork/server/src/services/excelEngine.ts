import ExcelJS from "exceljs";
import crypto from "crypto";
import { DateTime } from "luxon";

// exceljs's shipped .d.ts omits Worksheet#dataValidations even though it
// exists at runtime (lib/doc/worksheet.js) — narrow cast instead of `any`.
interface WorksheetWithValidations extends ExcelJS.Worksheet {
  dataValidations: { add: (range: string, validation: Record<string, unknown>) => void };
}

export type FieldDataType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "BOOLEAN";

export interface FieldDef {
  key: string;
  label: string;
  dataType: FieldDataType;
  options?: string[];
  unit?: string;
  isRequired?: boolean;
  section?: string;
  min?: number;
  max?: number;
  // APE-only: lets the importer/diff engine know this key writes onto a
  // real AnnualPhysicalExam column instead of the generic APEFieldValue
  // table (see apeCatalog.ts). Undefined for every other import type.
  mapsToCoreColumn?: string;
}

export interface RosterRow {
  employeeCode: string;
  lastName: string;
  firstName: string;
  middleName: string;
}

export interface WorkbookMeta {
  templateId: string;
  templateVersion: number;
  importType: string;
  examYear?: number;
  generatedAt: string;
  generatedBy: string;
}

const DATA_START_ROW = 3;
const LABEL_ROW = 1;
const KEY_ROW = 2;

function computeChecksum(meta: Omit<WorkbookMeta, "generatedAt" | "generatedBy">): string {
  const raw = `${meta.templateId}:${meta.templateVersion}:${meta.importType}:${meta.examYear ?? ""}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function generateWorkbook(opts: {
  fields: FieldDef[];
  meta: WorkbookMeta;
  roster: RosterRow[];
  templateName: string;
}): ExcelJS.Workbook {
  const { fields, meta, roster, templateName } = opts;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "FITWORK";
  workbook.created = new Date();

  // ── DATA sheet ──────────────────────────────────────────────────────
  const data = workbook.addWorksheet("DATA", { views: [{ state: "frozen", ySplit: LABEL_ROW }] });

  // Employee Code (col A) is the real matching key. Last/First/Middle Name
  // (cols B/C/D) are generated, read-only verification columns matching how
  // names are actually stored on the employee record — never a single
  // combined name column, and never used for row-to-employee matching.
  const columns = [
    { label: "Employee Code", key: "employee_code" },
    { label: "Last Name", key: "employee_last_name" },
    { label: "First Name", key: "employee_first_name" },
    { label: "Middle Name", key: "employee_middle_name" },
    ...fields.map((f) => ({ label: `${f.label}${f.unit ? ` (${f.unit})` : ""}${f.isRequired ? " *" : ""}`, key: f.key })),
  ];
  const NAME_VERIFICATION_COLS = 3; // B, C, D

  columns.forEach((c, i) => {
    const col = i + 1;
    data.getCell(LABEL_ROW, col).value = c.label;
    data.getCell(KEY_ROW, col).value = c.key;
    data.getColumn(col).width = Math.max(14, c.label.length + 2);
  });

  data.getRow(LABEL_ROW).font = { bold: true };
  data.getRow(LABEL_ROW).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5EDFB" } };
  data.getRow(KEY_ROW).hidden = true;

  // Name verification columns are generated/read-only for visual
  // verification only.
  for (let col = 2; col <= 1 + NAME_VERIFICATION_COLS; col++) {
    data.getColumn(col).eachCell({ includeEmpty: false }, (cell, rowNum) => {
      if (rowNum >= DATA_START_ROW) cell.protection = { locked: true };
    });
  }

  roster.forEach((r, i) => {
    const row = DATA_START_ROW + i;
    data.getCell(row, 1).value = r.employeeCode;
    data.getCell(row, 2).value = r.lastName;
    data.getCell(row, 3).value = r.firstName;
    data.getCell(row, 4).value = r.middleName;
  });

  const lastRow = Math.max(DATA_START_ROW + roster.length + 50, DATA_START_ROW + 200);

  fields.forEach((f, idx) => {
    const col = idx + 2 + NAME_VERIFICATION_COLS;
    const colLetter = data.getColumn(col).letter;
    const range = `${colLetter}${DATA_START_ROW}:${colLetter}${lastRow}`;

    if (f.dataType === "SELECT" && f.options?.length) {
      (data as WorksheetWithValidations).dataValidations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [`"${f.options.join(",")}"`],
        showErrorMessage: true,
        errorTitle: "Invalid value",
        error: `Must be one of: ${f.options.join(", ")}`,
      });
    } else if (f.dataType === "DATE") {
      (data as WorksheetWithValidations).dataValidations.add(range, {
        type: "date",
        operator: "between",
        allowBlank: true,
        formulae: [new Date(1990, 0, 1), new Date(2100, 0, 1)],
        showErrorMessage: true,
        errorTitle: "Invalid date",
        error: "Enter a valid date",
      });
    } else if (f.dataType === "NUMBER" && (f.min !== undefined || f.max !== undefined)) {
      (data as WorksheetWithValidations).dataValidations.add(range, {
        type: "decimal",
        operator: "between",
        allowBlank: true,
        formulae: [f.min ?? -999999999, f.max ?? 999999999],
        showErrorMessage: true,
        errorTitle: "Out of range",
        error: `Must be between ${f.min ?? "-∞"} and ${f.max ?? "∞"}`,
      });
    } else if (f.dataType === "BOOLEAN") {
      (data as WorksheetWithValidations).dataValidations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [`"Yes,No"`],
      });
    }
  });

  // ── INSTRUCTIONS sheet ──────────────────────────────────────────────
  const instructions = workbook.addWorksheet("INSTRUCTIONS");
  instructions.getColumn(1).width = 100;
  const lines = [
    `FITWORK — ${templateName}`,
    "",
    "Do NOT add, delete, reorder, rename, or hide any column in the DATA sheet.",
    "Column A (Employee Code) is system-generated and identifies the row — this is the ONLY column used to match a row to an employee. Never edit it.",
    "Columns B/C/D (Last/First/Middle Name) are for your visual verification only and are never saved back — if a name looks wrong for a code, stop and check the code, don't edit the name.",
    "",
    "Field guide:",
    ...fields.map((f) => `  • ${f.label}${f.unit ? ` (${f.unit})` : ""} — ${f.dataType}${f.isRequired ? ", required" : ""}${f.options?.length ? ` — one of: ${f.options.join(", ")}` : ""}`),
    "",
    "When finished, save this file and upload it back into FITWORK exactly as-is — do not convert format or re-save under a different program.",
  ];
  lines.forEach((line, i) => { instructions.getCell(i + 1, 1).value = line; });
  instructions.getRow(1).font = { bold: true, size: 14 };

  // ── Hidden _META sheet ──────────────────────────────────────────────
  const metaSheet = workbook.addWorksheet("_META", { state: "veryHidden" });
  const checksum = computeChecksum(meta);
  const metaEntries: [string, string][] = [
    ["templateId", meta.templateId],
    ["templateVersion", String(meta.templateVersion)],
    ["importType", meta.importType],
    ["examYear", meta.examYear !== undefined ? String(meta.examYear) : ""],
    ["generatedAt", meta.generatedAt],
    ["generatedBy", meta.generatedBy],
    ["checksum", checksum],
  ];
  metaEntries.forEach(([k, v], i) => {
    metaSheet.getCell(i + 1, 1).value = k;
    metaSheet.getCell(i + 1, 2).value = v;
  });

  return workbook;
}

export class StampError extends Error {}

export async function readWorkbookMeta(workbook: ExcelJS.Workbook): Promise<WorkbookMeta> {
  const metaSheet = workbook.getWorksheet("_META");
  if (!metaSheet) {
    throw new StampError("This file has no FITWORK stamp. Please download a fresh template from the Templates page and re-encode into that file.");
  }

  const map: Record<string, string> = {};
  metaSheet.eachRow((row) => {
    const key = row.getCell(1).value;
    const value = row.getCell(2).value;
    if (typeof key === "string") map[key] = value !== null && value !== undefined ? String(value) : "";
  });

  const required = ["templateId", "templateVersion", "importType", "generatedAt", "generatedBy", "checksum"];
  for (const key of required) {
    if (!(key in map)) throw new StampError("The FITWORK stamp in this file is incomplete or corrupted. Please download a fresh template.");
  }

  const meta: WorkbookMeta & { examYear?: number } = {
    templateId: map.templateId,
    templateVersion: Number(map.templateVersion),
    importType: map.importType,
    examYear: map.examYear ? Number(map.examYear) : undefined,
    generatedAt: map.generatedAt,
    generatedBy: map.generatedBy,
  };

  const expectedChecksum = computeChecksum(meta);
  if (expectedChecksum !== map.checksum) {
    throw new StampError("The FITWORK stamp in this file does not match its contents (it may have been altered). Please download a fresh template.");
  }

  return meta;
}

export interface ParsedRow {
  rowNumber: number;
  employeeCode: string;
  employeeNameInFile: string;
  values: Record<string, { raw: unknown; error?: string }>;
  isBlank: boolean;
}

function parseCellValue(cell: ExcelJS.CellValue, field: FieldDef): { value: unknown; error?: string } {
  if (cell === null || cell === undefined || cell === "") return { value: null };

  const strVal = typeof cell === "object" && cell !== null && "text" in (cell as object)
    ? String((cell as { text: unknown }).text)
    : String(cell);

  if (/^(n\/a|na|--|—|-)$/i.test(strVal.trim())) {
    return { value: null, error: field.dataType === "NUMBER" || field.dataType === "DATE" ? undefined : undefined };
  }

  switch (field.dataType) {
    case "TEXT":
      return { value: strVal.trim() };
    case "NUMBER": {
      const n = typeof cell === "number" ? cell : Number(strVal.replace(/,/g, ""));
      if (Number.isNaN(n)) return { value: null, error: `"${strVal}" is not a valid number` };
      if (field.min !== undefined && n < field.min) return { value: null, error: `${n} is below the minimum (${field.min})` };
      if (field.max !== undefined && n > field.max) return { value: null, error: `${n} is above the maximum (${field.max})` };
      return { value: n };
    }
    case "DATE": {
      if (cell instanceof Date) return { value: cell };
      const asExcelSerial = typeof cell === "number" ? cell : Number(strVal);
      if (!Number.isNaN(asExcelSerial) && typeof cell === "number") {
        // Excel serial date (days since 1899-12-30)
        const epoch = DateTime.fromISO("1899-12-30");
        return { value: epoch.plus({ days: asExcelSerial }).toJSDate() };
      }
      const formats = ["MM/dd/yyyy", "dd-MMM-yyyy", "yyyy-MM-dd", "M/d/yyyy"];
      for (const fmt of formats) {
        const dt = DateTime.fromFormat(strVal.trim(), fmt);
        if (dt.isValid) return { value: dt.toJSDate() };
      }
      return { value: null, error: `"${strVal}" is not a recognized date format` };
    }
    case "BOOLEAN": {
      const v = strVal.trim().toLowerCase();
      if (["yes", "true", "1"].includes(v)) return { value: true };
      if (["no", "false", "0"].includes(v)) return { value: false };
      return { value: null, error: `"${strVal}" must be Yes or No` };
    }
    case "SELECT": {
      const v = strVal.trim();
      if (field.options && !field.options.includes(v)) {
        return { value: null, error: `"${v}" is not one of the allowed options: ${field.options.join(", ")}` };
      }
      return { value: v };
    }
    default:
      return { value: strVal };
  }
}

export function parseDataSheet(workbook: ExcelJS.Workbook, fields: FieldDef[]): ParsedRow[] {
  const sheet = workbook.getWorksheet("DATA");
  if (!sheet) throw new StampError("The DATA sheet is missing from this file.");

  const keyRow = sheet.getRow(KEY_ROW);
  const colByKey = new Map<string, number>();
  keyRow.eachCell({ includeEmpty: false }, (cell, col) => {
    if (typeof cell.value === "string") colByKey.set(cell.value, col);
  });

  if (colByKey.get("employee_code") !== 1) {
    throw new StampError("Column A must be Employee Code and cannot be removed, reordered, or renamed.");
  }
  if (
    colByKey.get("employee_last_name") !== 2 ||
    colByKey.get("employee_first_name") !== 3 ||
    colByKey.get("employee_middle_name") !== 4
  ) {
    throw new StampError("Columns B/C/D must be Last Name/First Name/Middle Name and cannot be removed, reordered, or renamed.");
  }

  const rows: ParsedRow[] = [];
  for (let r = DATA_START_ROW; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const codeCell = row.getCell(1).value;
    const lastCell = row.getCell(2).value;
    const firstCell = row.getCell(3).value;
    const middleCell = row.getCell(4).value;
    const employeeCode = codeCell !== null && codeCell !== undefined ? String(codeCell).trim() : "";
    const lastName = lastCell !== null && lastCell !== undefined ? String(lastCell).trim() : "";
    const firstName = firstCell !== null && firstCell !== undefined ? String(firstCell).trim() : "";
    const middleName = middleCell !== null && middleCell !== undefined ? String(middleCell).trim() : "";
    const employeeNameInFile = [lastName, [firstName, middleName].filter(Boolean).join(" ")].filter(Boolean).join(", ");

    const values: Record<string, { raw: unknown; error?: string }> = {};
    let hasAnyValue = false;

    for (const f of fields) {
      const col = colByKey.get(f.key);
      if (!col) continue;
      const cellValue = row.getCell(col).value;
      const { value, error } = parseCellValue(cellValue, f);
      if (value !== null && value !== undefined) hasAnyValue = true;
      values[f.key] = { raw: value, error };
    }

    if (!employeeCode && !hasAnyValue) continue; // fully blank row, skip silently
    rows.push({ rowNumber: r, employeeCode, employeeNameInFile, values, isBlank: !employeeCode && !hasAnyValue });
  }

  return rows;
}
