/**
 * Demo/evaluation seed data. NEVER run in production — guarded below.
 * Run with: npm run seed
 *
 * Creates 2 admins (a primary + a standing backup), 2 doctors, 1 dentist,
 * 3 nurses, 40 employees across 5
 * departments (with solid-color placeholder photos), ~150 clinical notes,
 * ~60 medication entries, ~80 documents, and ~3 years of APE records.
 * All seeded accounts share the password below and are clearly fake.
 */
import "../server/src/env";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { computeBmi, bmiCategory } from "../server/src/services/bmi";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to run seed data in production (NODE_ENV=production).");
  process.exit(1);
}

const prisma = new PrismaClient();

const SEED_PASSWORD = "SeedDemo12345";
const STORAGE_DIR = path.resolve(__dirname, "../storage");

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randDateBetween(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
function randBool(pTrue = 0.5): boolean {
  return Math.random() < pTrue;
}

// Idempotent: if this username already exists (e.g. an admin created via
// `npm run create-admin` before seeding, or re-running this script), reuse
// that row as-is rather than crashing on a unique-constraint error — never
// overwrite an existing account's password/role, since it may be a real
// account, not seed data.
async function upsertUser(data: { username: string; fullName: string; role: string; licenseNumber?: string; passwordHash: string; mustChangePassword: boolean }) {
  return prisma.user.upsert({
    where: { username: data.username },
    create: data,
    update: {},
  });
}

const FIRST_NAMES_M = ["Juan", "Jose", "Antonio", "Ramon", "Miguel", "Carlos", "Eduardo", "Rafael", "Ricardo", "Manuel", "Fernando", "Roberto", "Alfredo", "Danilo", "Ernesto"];
const FIRST_NAMES_F = ["Maria", "Ana", "Carmen", "Teresa", "Rosario", "Luz", "Corazon", "Erlinda", "Josefina", "Remedios", "Angelica", "Cristina", "Beatriz", "Leonora", "Perla"];
const LAST_NAMES = ["Dela Cruz", "Santos", "Reyes", "Garcia", "Bautista", "Mendoza", "Torres", "Ramos", "Flores", "Villanueva", "Castillo", "Aquino", "Salazar", "Del Rosario", "Navarro", "Gonzales", "Pascual", "Domingo", "Cruz", "Fernandez"];
const DEPARTMENTS = ["Production", "Warehouse", "Administration", "Maintenance", "Quality Control"];
const POSITIONS: Record<string, string[]> = {
  Production: ["Line Operator", "Machine Operator", "Production Supervisor"],
  Warehouse: ["Warehouseman", "Forklift Operator", "Inventory Clerk"],
  Administration: ["HR Officer", "Accounting Clerk", "Admin Assistant"],
  Maintenance: ["Mechanic", "Electrician", "Maintenance Supervisor"],
  "Quality Control": ["QC Inspector", "QC Analyst", "QC Supervisor"],
};
const BLOOD_TYPES = ["O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];
const ALLERGIES = [null, null, null, null, "Penicillin", "Sulfa drugs", "Shellfish", "Peanuts"];
const CHRONIC = [null, null, null, null, "Hypertension", "Type 2 Diabetes", "Asthma"];

const VISIT_CATEGORIES = ["CONSULT", "INJURY", "ILLNESS", "FOLLOW_UP", "APE_REVIEW", "FIT_TO_WORK", "OTHER"];
const DISPOSITIONS = ["RETURN_TO_WORK", "LIGHT_DUTY", "SENT_HOME", "REFERRED", "OBSERVATION"];
const CHIEF_COMPLAINTS = ["Headache", "Cough and colds", "Lower back pain", "Minor cut on hand", "Dizziness", "Fever", "Stomach ache", "Toothache", "Muscle strain", "Allergic reaction (mild)"];
const DRUG_NAMES = [
  { name: "Paracetamol", strength: "500mg", form: "tablet" },
  { name: "Mefenamic Acid", strength: "500mg", form: "tablet" },
  { name: "Cetirizine", strength: "10mg", form: "tablet" },
  { name: "Amoxicillin", strength: "500mg", form: "capsule" },
  { name: "Loperamide", strength: "2mg", form: "capsule" },
  { name: "Salbutamol", strength: "2mg", form: "tablet" },
  { name: "Betadine", strength: "10%", form: "topical solution" },
];
const DOC_CATEGORIES = ["LABORATORY", "IMAGING", "APE", "DENTAL", "MEDICAL_CERTIFICATE", "CLEARANCE", "VACCINATION", "OTHER"];
const DOC_TITLES: Record<string, string[]> = {
  LABORATORY: ["CBC Result", "Urinalysis Result", "Fecalysis Result"],
  IMAGING: ["Chest X-ray", "Abdominal Ultrasound"],
  APE: ["Annual Physical Exam Form"],
  DENTAL: ["Dental X-ray", "Dental Clearance"],
  MEDICAL_CERTIFICATE: ["Medical Certificate - Fit to Work", "Medical Certificate - Sick Leave"],
  CLEARANCE: ["Pre-employment Clearance", "Return-to-work Clearance"],
  VACCINATION: ["Flu Vaccination Record", "Hepatitis B Vaccination Record"],
  OTHER: ["Miscellaneous Attachment"],
};

// A tiny, valid, minimal PDF used as placeholder content for every seeded
// document — passes magic-byte validation and opens fine in a viewer.
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  "utf-8"
);

function employeeDir(code: string, category: string): string {
  const dir = path.join(STORAGE_DIR, code, category);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function main() {
  console.log("Seeding FITWORK demo data (NODE_ENV != production, confirmed)...");

  const passwordHash = await argon2.hash(SEED_PASSWORD, { type: argon2.argon2id });

  const admin = await upsertUser({ username: "admin", fullName: "Clinic Admin", role: "ADMIN", passwordHash, mustChangePassword: false });
  // A second, equally-real admin account — visible in Admin > Users like
  // any other account, not a hidden/special one. Purpose: operational
  // redundancy. If the primary admin's credentials are lost, this account
  // can still log in and reset/recreate the primary via Admin > Users,
  // without needing the recovery-key tool (see docs/RECOVERY.md).
  const admin2 = await upsertUser({ username: "admin2", fullName: "Backup Clinic Admin", role: "ADMIN", passwordHash, mustChangePassword: false });
  const doctors = await Promise.all([
    upsertUser({ username: "doctor1", fullName: "Dr. Ramon Reyes", role: "DOCTOR", licenseNumber: "MD-10234", passwordHash, mustChangePassword: false }),
    upsertUser({ username: "doctor2", fullName: "Dr. Cristina Santos", role: "DOCTOR", licenseNumber: "MD-10891", passwordHash, mustChangePassword: false }),
  ]);
  const dentist = await upsertUser({ username: "dentist1", fullName: "Dr. Miguel Torres", role: "DENTIST", licenseNumber: "DDS-4471", passwordHash, mustChangePassword: false });
  const nurses = await Promise.all([
    upsertUser({ username: "nurse1", fullName: "Nurse Erlinda Bautista", role: "NURSE", licenseNumber: "RN-88213", passwordHash, mustChangePassword: false }),
    upsertUser({ username: "nurse2", fullName: "Nurse Danilo Mendoza", role: "NURSE", licenseNumber: "RN-88214", passwordHash, mustChangePassword: false }),
    upsertUser({ username: "nurse3", fullName: "Nurse Perla Villanueva", role: "NURSE", licenseNumber: "RN-88215", passwordHash, mustChangePassword: false }),
  ]);
  console.log(`Created ${2 + doctors.length + 1 + nurses.length} users (admins/doctors/dentist/nurses).`);

  const employees = [];
  for (let i = 1; i <= 40; i++) {
    const sex = randBool() ? "MALE" : "FEMALE";
    const firstName = rand(sex === "MALE" ? FIRST_NAMES_M : FIRST_NAMES_F);
    const lastName = rand(LAST_NAMES);
    const department = DEPARTMENTS[i % DEPARTMENTS.length];
    const code = `EMP${String(i).padStart(3, "0")}`;

    const employee = await prisma.employee.create({
      data: {
        employeeCode: code,
        firstName,
        lastName,
        sex,
        dateOfBirth: randDateBetween(new Date(1970, 0, 1), new Date(2002, 0, 1)),
        civilStatus: rand(["Single", "Married", "Widowed"]),
        bloodType: rand(BLOOD_TYPES),
        department,
        position: rand(POSITIONS[department]),
        employmentStatus: rand(["Regular", "Probationary", "Contractual"]),
        dateHired: randDateBetween(new Date(2015, 0, 1), new Date(2025, 0, 1)),
        mobileNumber: `09${randInt(100000000, 999999999)}`,
        emergencyContactName: `${rand(FIRST_NAMES_F)} ${lastName}`,
        emergencyContactRelation: rand(["Spouse", "Parent", "Sibling"]),
        emergencyContactNumber: `09${randInt(100000000, 999999999)}`,
        knownAllergies: rand(ALLERGIES) ?? undefined,
        chronicConditions: rand(CHRONIC) ?? undefined,
      },
    });

    // Solid-color placeholder avatar (deterministic hue from the employee code).
    const hue = (code.charCodeAt(3) * 37 + code.charCodeAt(4) * 17) % 360;
    const rgb = hslToRgb(hue / 360, 0.45, 0.55);
    const dir = employeeDir(code, "photo");
    const photoPath = path.join(dir, `${uuid()}.jpg`);
    const thumbPath = path.join(dir, `${uuid()}-thumb.jpg`);
    await sharp({ create: { width: 600, height: 600, channels: 3, background: rgb } }).jpeg({ quality: 85 }).toFile(photoPath);
    await sharp({ create: { width: 120, height: 120, channels: 3, background: rgb } }).jpeg({ quality: 85 }).toFile(thumbPath);
    await prisma.employee.update({ where: { id: employee.id }, data: { photoPath, photoThumbPath: thumbPath } });

    employees.push(employee);
  }
  console.log(`Created ${employees.length} employees with placeholder photos.`);

  const now = new Date();
  const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());

  const allStaff = [admin, admin2, ...doctors, dentist, ...nurses];
  let vitalsCount = 0;
  for (const employee of employees) {
    const baseHeight = randInt(150, 185);
    // Start from a plausible BMI (18.5-27) for this height, then drift
    // narrowly between visits — keeps seeded charts looking realistic
    // instead of occasionally landing on an absurd combination.
    const startingBmi = 18.5 + Math.random() * 8.5;
    let weight = Math.round(startingBmi * (baseHeight / 100) ** 2);
    const visits = randInt(2, 4);
    const dates = Array.from({ length: visits }, () => randDateBetween(twoYearsAgo, now)).sort((a, b) => a.getTime() - b.getTime());
    for (const recordedAt of dates) {
      weight = Math.max(40, Math.min(120, weight + randInt(-2, 2))); // small drift between visits, for a chart with visible movement
      const bmi = computeBmi(baseHeight, weight);
      await prisma.vitalsRecord.create({
        data: {
          employeeId: employee.id,
          recordedAt,
          recordedById: rand(allStaff).id,
          heightCm: baseHeight,
          weightKg: weight,
          bmi,
          bmiCategory: bmiCategory(bmi),
          systolic: randInt(100, 135),
          diastolic: randInt(65, 88),
          pulseRate: randInt(60, 95),
          temperatureC: 36.5,
        },
      });
      vitalsCount++;
    }
  }
  console.log(`Created ${vitalsCount} vitals records.`);

  const allClinicians = [
    ...doctors.map((d) => ({ user: d, noteType: "DOCTOR" })),
    { user: dentist, noteType: "DENTIST" },
    ...nurses.map((n) => ({ user: n, noteType: "NURSE" })),
  ];

  const notes = [];
  for (let i = 0; i < 150; i++) {
    const clinician = rand(allClinicians);
    const employee = rand(employees);
    const visitDateTime = randDateBetween(twoYearsAgo, now);
    const note = await prisma.clinicalNote.create({
      data: {
        employeeId: employee.id,
        authorId: clinician.user.id,
        noteType: clinician.noteType,
        visitDateTime,
        visitCategory: rand(VISIT_CATEGORIES),
        chiefComplaint: rand(CHIEF_COMPLAINTS),
        assessment: rand(["Likely viral in origin", "Musculoskeletal strain", "Mild allergic reaction", "Stable, no red flags"]),
        // Doctor's/Dentist's Notes: diagnosis/treatment/recommendation.
        diagnosis: clinician.noteType !== "NURSE" ? rand(["Acute viral URI", "Lumbar strain", "Contact dermatitis", "No acute pathology"]) : undefined,
        treatment: clinician.noteType !== "NURSE" ? rand(["Rest and hydration advised", "Medication dispensed, monitor symptoms", "Topical treatment applied"]) : undefined,
        recommendation: clinician.noteType !== "NURSE" ? rand(["Follow up if symptoms persist", "Referred for further evaluation", "Return to work, no restrictions"]) : undefined,
        // Nurse's Notes: nursingDiagnosis/plan/intervention/evaluation.
        nursingDiagnosis: clinician.noteType === "NURSE" ? rand(["Acute pain related to injury", "Risk for infection", "Activity intolerance"]) : undefined,
        plan: clinician.noteType === "NURSE" ? rand(["Monitor vitals, rest advised", "First aid administered, observe for 30 min", "Refer to physician if no improvement"]) : undefined,
        intervention: clinician.noteType === "NURSE" ? rand(["Administered first aid", "Applied cold compress", "Provided health teaching"]) : undefined,
        evaluation: clinician.noteType === "NURSE" ? rand(["Symptoms improved after intervention", "No change, referred to doctor", "Employee tolerated intervention well"]) : undefined,
        disposition: rand(DISPOSITIONS),
        isWorkRelated: randBool(0.25),
        status: "FINAL",
        editableUntil: new Date(visitDateTime.getTime() + 15 * 60 * 1000), // window has long since closed for backdated seed notes
      },
    });
    notes.push(note);
  }

  // A few voided notes and addenda, for realism.
  for (const note of notes.slice(0, 5)) {
    await prisma.clinicalNote.update({
      where: { id: note.id },
      data: { status: "VOIDED", voidReason: "Encoded under the wrong employee, re-recorded correctly", voidedById: note.authorId, voidedAt: new Date() },
    });
  }
  for (const note of notes.slice(5, 15)) {
    const otherClinician = rand(allClinicians.filter((c) => c.user.id !== note.authorId));
    await prisma.noteAddendum.create({
      data: { noteId: note.id, authorId: otherClinician.user.id, body: "Reviewed and concur with the assessment above." },
    });
  }
  console.log(`Created ${notes.length} clinical notes (with a few voids and addenda for realism).`);

  for (let i = 0; i < 60; i++) {
    const employee = rand(employees);
    const drug = rand(DRUG_NAMES);
    const dispenser = rand(allClinicians.filter((c) => c.noteType !== "NURSE" || true)).user; // any clinician may dispense
    await prisma.medicationLog.create({
      data: {
        employeeId: employee.id,
        dispensedAt: randDateBetween(twoYearsAgo, now),
        dispensedById: dispenser.id,
        drugName: drug.name,
        strength: drug.strength,
        dosageForm: drug.form,
        route: drug.form.includes("topical") ? "Topical" : "Oral",
        frequency: rand(["Once", "q6h", "q8h", "BID", "TID"]),
        quantityDispensed: `${randInt(1, 20)} ${drug.form}(s)`,
        indication: rand(CHIEF_COMPLAINTS),
      },
    });
  }
  console.log("Created 60 medication log entries.");

  for (let i = 0; i < 80; i++) {
    const employee = rand(employees);
    const category = rand(DOC_CATEGORIES);
    const title = rand(DOC_TITLES[category]);
    const dir = employeeDir(employee.employeeCode, category);
    const filePath = path.join(dir, `${uuid()}.pdf`);
    fs.writeFileSync(filePath, MINIMAL_PDF);
    await prisma.medicalDocument.create({
      data: {
        employeeId: employee.id,
        category,
        title,
        documentDate: randDateBetween(twoYearsAgo, now),
        filePath,
        originalFilename: `${title.replace(/\s+/g, "_")}.pdf`,
        mimeType: "application/pdf",
        fileSizeBytes: MINIMAL_PDF.length,
        uploadedById: rand([...doctors, dentist, ...nurses, admin, admin2]).id,
      },
    });
  }
  console.log("Created 80 medical documents.");

  const years = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear()];
  let apeCount = 0;
  for (const employee of employees) {
    for (const examYear of years) {
      if (!randBool(0.7)) continue; // not every employee has an APE every year
      const heightCm = randInt(150, 185);
      const weightKg = randInt(45, 95);
      const bmi = Math.round((weightKg / ((heightCm / 100) ** 2)) * 10) / 10;
      await prisma.annualPhysicalExam.create({
        data: {
          employeeId: employee.id,
          examYear,
          examDate: new Date(examYear, randInt(0, 11), randInt(1, 28)),
          provider: "Occupational Health Clinic",
          heightCm, weightKg, bmi,
          bloodPressure: `${randInt(100, 130)}/${randInt(60, 85)}`,
          visionOD: "20/20", visionOS: "20/20",
          hearing: "Normal",
          cbcResult: "Within normal limits",
          urinalysisResult: "Within normal limits",
          fecalysisResult: "Within normal limits",
          chestXrayResult: "No active disease",
          drugTestResult: "NEGATIVE",
          fitnessClassification: rand(["CLASS_A", "CLASS_A", "CLASS_A", "CLASS_B", "CLASS_C"]),
          sourceType: "MANUAL",
        },
      }).catch(() => { /* unique constraint race on employeeId+examYear — skip */ });
      apeCount++;
    }
  }
  console.log(`Created ${apeCount} Annual Physical Exam records across ${years.join(", ")}.`);

  console.log("\nSeed complete. Demo login credentials (all share one password):");
  console.log(`  Password for all seeded accounts: ${SEED_PASSWORD}`);
  console.log("  Usernames: admin, admin2, doctor1, doctor2, dentist1, nurse1, nurse2, nurse3");
  console.log("  ('admin2' is the standing backup admin account — see docs/RECOVERY.md.)");
}

// Small local HSL->RGB helper (avoids pulling in a color library for one placeholder-avatar color).
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  function hue2rgb(p: number, q: number, t: number) {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

main()
  .catch((e) => { console.error("Seed failed:", e); process.exit(1); })
  .finally(() => prisma.$disconnect());
