# FITWORK — Excel Import Guide (admin only)

FITWORK is not a general-purpose spreadsheet importer that guesses at arbitrary files. **The app owns the format**: you tell FITWORK what to capture, FITWORK generates the Excel file, your clinic/lab fills it in, and the same file is uploaded back. Because the app authored the file, the round-trip is exact and unambiguous — there is no manual column-mapping step.

```
Define what to capture  →  FITWORK generates .xlsx (stamped + pre-filled roster)
      →  Clinic/lab encodes results  →  Upload the same file
      →  Dry-run preview  →  Commit  →  Records appear on each employee's profile
```

## The four import types

| Type | Where to generate the workbook | What it does |
|---|---|---|
| **APE** (Annual Physical Exam) | Admin → APE Templates → *Generate workbook* | One row per employee per exam year. You define the field list yourself (see below) — it's the only type with a custom template builder. |
| **Employees** | Admin → Import → step 1 | Creates or updates employee demographics. Unknown codes with data create a new employee; existing codes update. |
| **Medications** | Admin → Import → step 1 | Backfills the dispensing log. |
| **Historical Notes** | Admin → Import → step 1 | Imports old paper notes as `ClinicalNote` records, locked immediately with no self-correction window, and the original (pre-FITWORK) author's name preserved as free text. |

## Building an APE template

1. Go to **Admin → APE Templates → New template**.
2. Tick the standard fields you want from the catalog (height, weight, blood pressure, vision, CBC, chest X-ray, fitness classification, etc.), and/or add your own custom fields (label + data type: text, number, date, dropdown, or yes/no).
3. Save. The template is now ready to generate workbooks from — but it isn't locked yet, so you can still freely edit it.

**Once a template has been used for a real import (its first successful commit), it locks automatically.** From then on, editing it creates a new version (v2, v3, …) instead of changing the original — this guarantees that APE records already captured under v1 keep rendering correctly under v1's field definitions forever, even after the template evolves.

## Generating and filling in the workbook

1. From the template list, click **Generate workbook**. Choose the exam year and, optionally, filter the roster to one department.
2. The downloaded `.xlsx` has three sheets:
   - **DATA** — this is where results go. Row 1 is the human-readable column labels (frozen at the top, don't touch). Column A is always `employee_code` — it is system-generated, cannot be removed/reordered/renamed, and is the only thing that binds a row to a person. Column B, `employee_name`, is filled in for your visual double-check only — it is never read back into the database, so don't bother editing it if it looks wrong; instead, check that column A has the right code.
   - **INSTRUCTIONS** — a plain-language field guide.
   - A hidden sheet carries FITWORK's internal "stamp" — don't try to view, edit, or remove it. This is what lets FITWORK recognize the file automatically when you upload it back.
3. **Do not add, delete, reorder, or rename any column.** If you need a field that isn't there, go back and add it to the template (which creates a new version) rather than improvising in the spreadsheet.
4. Fill in results for each employee. Leave a cell blank if there's nothing to report for that field.
5. Save the file — don't "Save As" into a different format, and don't open it in a different spreadsheet program that might strip the hidden stamp.

## Uploading it back

1. Go to **Admin → Import**.
2. In step 2 ("Upload the filled-in workbook"), choose your file and click **Run dry-run preview**. This works for any import type, including APE files generated from the Templates tab — the type selector in step 1 only controls which *fixed-schema* template gets downloaded, it doesn't gate what you can upload.
3. FITWORK reads the file's stamp to identify exactly which template/version and import type it came from — you don't pick anything manually. If the file has no stamp (e.g. it's an old, pre-FITWORK spreadsheet) or the stamp looks tampered with, you'll get a clear error telling you to download a fresh template instead.
4. You'll see a per-row preview: **New**, **Update**, **Error**, or **Skipped**, with a reason for every error or skip. Nothing is committed yet.
   - An unknown employee code is always an **Error** — FITWORK never silently creates a person from an unrecognized code (except for the Employees import type, where a new code with data is exactly how you add someone).
   - A row with a code but no data in any field is **Skipped** ("nothing to import").
   - "N/A", "—", or similar placeholder text in a numeric field becomes a warning, not a hard failure.
5. Once you're satisfied with the preview, click **Commit import**. This applies all New/Update rows in a single atomic transaction — either everything commits or nothing does. Rows that were flagged as errors are simply left out; they don't block the rows that are fine.
6. After committing, you can download a result report (`.xlsx`) listing every row's final outcome, and it's kept in the **Import history** table at the bottom of the page for later reference.

## Legacy (pre-FITWORK) files

Older workbooks that predate FITWORK won't have the stamp described above, so the automatic identify-and-import flow won't accept them directly. For those, use the historical backfill path: contact your administrator, who can set up a one-time column-mapping for that specific legacy file format. This is only intended for the initial historical backfill — the stamped round-trip described above is the normal, everyday way to import going forward.

## Everything imported is traceable

Every import writes an `ImportBatch` record and an audit log entry, and the original uploaded file itself is retained on the server (`/storage/_imports/`) — so any record on an employee's profile can always be traced back to exactly which spreadsheet, uploaded by whom, and when, produced it.
