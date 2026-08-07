# FITWORK — User Guide

FITWORK is the clinic's digital replacement for paper doctor's notes, nurse's logbooks, medication dispensing logs, and annual physical exam (APE) files. One employee code brings up that employee's complete medical history in one place.

---

## 1. Logging in

Go to the address given to you by your administrator (e.g. `https://192.168.1.50:8443` or `https://clinic-server.local`). You'll see a banner: *"Authorized clinic personnel only. All access is logged."* — this is not just a notice; every view and edit is recorded (see §8, Audit).

- On your very first login, you'll be forced to set a new password (minimum 10 characters).
- After 5 failed login attempts, your account locks for 15 minutes.
- Never share your login. Because every action is attributed to your account, sharing credentials means someone else's actions show up under your name.

## 2. Finding an employee

The search bar is always at the top of the screen. Press `/` anywhere to jump to it.

- Type the exact employee code and press Enter — it goes straight to that employee's profile.
- Type a partial code, name, or department — you'll get a list of matches to choose from.

## 3. The employee profile

The header at the top (visible on every tab) always shows: photo, name, employee code, age, sex, department, blood type, latest height/weight, and BMI with a colored category badge. If the employee has any known allergies, you'll see a **red banner** — check it before administering anything.

Tabs across the top:

- **Overview** — demographics, emergency contact, chronic conditions, and a timeline of the 10 most recent events of any kind.
- **Doctor's Notes / Nurse's Notes / Dental** — one tab per note type. You can only write the note type that matches your role (a nurse cannot write a doctor's note, and so on). Admin accounts cannot write any clinical note — admin is an operational role, not a clinical one.
- **Medications** — everything dispensed to this employee, newest first.
- **Labs & Documents** — uploaded files by category, with inline preview for PDFs and images.
- **Annual Physical Exams** — one entry per year, expandable for full details.
- **Vitals** — a table plus charts of weight, BMI, and blood pressure over time.
- **Audit** (admin only) — every view and edit ever recorded against this specific record.

## 4. Writing a clinical note — and why you can't edit it later

When you save a note, a confirmation dialog reminds you: **this note will be permanently saved and cannot be edited.** Read that before confirming — it's not a formality.

**You have a 15-minute self-correction window** right after saving, shown as a live countdown ("Editable for 12:04") on your own notes. Within that window, *you* (and only you) can fix a typo. Every correction is logged with a full before/after snapshot — nothing is silently overwritten. Once the countdown hits zero, the note is permanently locked, even to you, even to an admin.

**After the window closes, there are two ways to add information:**

1. **Addendum** — any clinician (doctor, nurse, or dentist — not admin) can add a timestamped, attributed addendum to any note. It appears underneath the original, never merged into it. Use this for follow-up observations, a second opinion, or new information that comes to light later.
2. **Void** — only the original author can void their own note, and only with a reason. A voided note isn't deleted — it stays fully visible with a strikethrough and the reason shown. Use this only when a note was genuinely entered against the wrong employee or is otherwise entirely wrong, not to "un-say" something you still stand by (use an addendum for that).

While drafting a new note, your work autosaves to your browser every 10 seconds — a browser crash won't lose an in-progress note. It clears once you actually submit.

## 5. The Note Ledger

A dedicated page (top navigation) lists **every** clinical note across **every** employee, newest first — the digital replacement for the physical logbooks. Filter by note type, author, department, date range, work-related flag, or disposition, and export the filtered view to Excel. Click any row to jump to that employee's profile.

## 6. Photos — upload or webcam

On an employee's profile, click their photo to open the capture modal. You can either upload a file or use **Use webcam**, which shows a live preview with a face-framing guide, lets you retake before saving, and stores a cropped 600×600 photo plus a small thumbnail.

The webcam option requires a secure connection — if you see an "insecure context" error, the server's HTTPS certificate likely isn't installed on your machine yet. Contact your administrator (see `INSTALL.md` §4).

## 7. Admin-only areas

If you're logged in as an admin, you'll see an **Admin** menu:

- **Users** — create accounts (any role, including Admin), deactivate them, reset passwords, and see last login. The very first admin account has to be created via a command-line script on the server (see `docs/INSTALL.md`) since there's no admin session yet to log in with — every account after that, including additional admins, can be created right here.
- **APE Templates** — define what an Annual Physical Exam captures (§9 below).
- **Import** — bulk-load data from Excel (§9 below).
- **Audit Log** — every recorded action across the whole system, filterable and exportable to CSV.
- **Backup** — see the last successful backup's status (it turns red if more than 48 hours old) and a "Run backup now" button.

Deactivating a user never removes their historical notes — their name still appears on every note they authored, shown as "(inactive)".

## 8. Every view is logged

Opening an employee's record, downloading a document, creating a user, running an import, running a backup — all of it is written to an append-only audit log. There is no way (for anyone, including admin) to edit or delete an audit entry. If you're an admin investigating a data question, start with the Audit Log or the per-employee Audit tab.

## 9. Bulk import from Excel (admin only)

See `IMPORT_GUIDE.md` for the full walkthrough. In short: FITWORK generates the Excel file for you (with your employee roster already filled in), your clinic/lab encodes results into it, and the same file is uploaded back — the system recognizes it automatically. There's no manual column mapping, because the app authored the file in the first place. A dry-run preview always shows you what will change before anything is committed.

## 10. Data privacy — Republic Act 10173 (Data Privacy Act)

This system stores sensitive personal health information. Under RA 10173, the clinic is the Personal Information Controller and is responsible for how this data is handled. In practice:

- **Access is per-user and fully audited.** Never share your login — every action under your name is assumed to be you.
- **Lock your screen** whenever you step away from a PC that's logged into FITWORK.
- **Backup media must be stored securely.** If your backups are written to an external drive or NAS, that media itself needs to be physically secured and access-controlled the same as the server.
- Report any suspected unauthorized access to your administrator immediately.

## 11. Getting help

If something looks wrong — a record that shouldn't be editable, a note that seems to have disappeared, a permission error you don't understand — stop and ask your administrator rather than working around it. Most of FITWORK's rules (immutability, role restrictions, audit logging) are deliberate safeguards, not bugs.
