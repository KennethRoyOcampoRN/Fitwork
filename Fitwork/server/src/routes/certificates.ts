import { Router } from "express";
import fs from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import { employeeDir } from "../lib/storage";
import { nextControlNumber } from "../services/certificateNumbering";
import { buildCertificatePdf, getCertificateBranding } from "../services/certificatePdf";

export const certificatesRouter = Router();
certificatesRouter.use(requireAuth);

// Only a Doctor or Dentist may issue a certificate — checked here, on the
// router, not just hidden in the client UI, per the feature's access
// control requirement.
const ISSUER_ROLES = ["DOCTOR", "DENTIST"] as const;
const VERIFIER_ROLES = ["ADMIN", "DOCTOR", "DENTIST", "NURSE"] as const;

function doctorTitleFor(role: string): string {
  return role === "DENTIST" ? "Dentist" : "Company Physician";
}

const employeeCertSchema = z.object({
  employeeId: z.string().uuid(),
  // Auto-filled from the employee record on the client but editable there
  // before submit — accepted here as the doctor's final, possibly-corrected
  // values rather than silently recomputed from the live Employee row,
  // which would discard any edit the form let them make.
  name: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  examDate: z.string(),
  complaints: z.string().min(1),
  diagnosis: z.string().min(1),
  remarks: z.string().min(1),
});

certificatesRouter.post("/employee", requireRole(...ISSUER_ROLES), async (req, res) => {
  const parsed = employeeCertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const employee = await prisma.employee.findUnique({ where: { id: parsed.data.employeeId } });
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const doctor = req.currentUser!;
  const doctorTitle = doctorTitleFor(doctor.role);
  const name = parsed.data.name || `${employee.firstName} ${employee.lastName}`.trim();
  const address = parsed.data.address || employee.address || "";
  const examDate = new Date(parsed.data.examDate);
  const issuedAt = new Date();
  const branding = await getCertificateBranding();

  const { controlNumber, certificate } = await prisma.$transaction(async (tx) => {
    const controlNumber = await nextControlNumber(tx, branding.certificatePrefix);
    const certificate = await tx.medicalCertificate.create({
      data: {
        controlNumber,
        employeeId: employee.id,
        name,
        address,
        examDate,
        complaints: parsed.data.complaints,
        diagnosis: parsed.data.diagnosis,
        remarks: parsed.data.remarks,
        doctorId: doctor.id,
        doctorTitle,
        issuedAt,
        // Filled in below once the PDF is rendered — the row must exist
        // first so the control number is allocated atomically with it.
        pdfPath: "",
      },
    });
    return { controlNumber, certificate };
  });

  const doc = buildCertificatePdf(branding, {
    controlNumber, issuedAt, examDate, name, address,
    complaints: parsed.data.complaints, diagnosis: parsed.data.diagnosis, remarks: parsed.data.remarks,
    doctorName: doctor.fullName, doctorTitle,
  });

  const dir = employeeDir(employee.employeeCode, "MEDICAL_CERTIFICATE");
  const pdfPath = path.join(dir, `${uuid()}.pdf`);
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("end", async () => {
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(pdfPath, buffer);
    await prisma.medicalCertificate.update({ where: { id: certificate.id }, data: { pdfPath } });

    await writeAudit({
      req, userId: doctor.id, action: "CREATE_CERTIFICATE", entityType: "MedicalCertificate", entityId: certificate.id,
      employeeId: employee.id, details: { controlNumber },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="medical-certificate-${controlNumber}.pdf"`);
    res.setHeader("X-Control-Number", controlNumber);
    // Lets the client offer an instant "Print" action right after issuing
    // without first re-listing this employee's certificates to look up
    // which row is the one just created — it can go straight to
    // GET /:id/file with this id. Only set here, not on /standalone below:
    // a standalone certificate's PDF is deliberately never persisted to
    // disk (see the comment above that route), so there's no /:id/file to
    // print from later — the client already has the blob it needs, from
    // this same response.
    res.setHeader("X-Certificate-Id", certificate.id);
    res.setHeader("Access-Control-Expose-Headers", "X-Control-Number, X-Certificate-Id");
    res.send(buffer);
  });
});

const standaloneCertSchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  examDate: z.string(),
  complaints: z.string().min(1),
  diagnosis: z.string().min(1),
  remarks: z.string().min(1),
});

// Standalone (non-employee) certificate. Deliberately does NOT touch any
// employee-linked table: only a minimal CertificateVerificationRecord
// (control number, issue date, issuing doctor) is persisted — no name,
// address, or clinical content. The audit entry below likewise omits
// employeeId and any content field, so this path leaves no trace in any
// employee's record or audit tab; the PDF is streamed to the caller and
// never written to disk.
certificatesRouter.post("/standalone", requireRole(...ISSUER_ROLES), async (req, res) => {
  const parsed = standaloneCertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const doctor = req.currentUser!;
  const doctorTitle = doctorTitleFor(doctor.role);
  const examDate = new Date(parsed.data.examDate);
  const issuedAt = new Date();
  const branding = await getCertificateBranding();

  const { controlNumber, record } = await prisma.$transaction(async (tx) => {
    const controlNumber = await nextControlNumber(tx, branding.certificatePrefix);
    const record = await tx.certificateVerificationRecord.create({
      data: { controlNumber, doctorId: doctor.id, issuedAt },
    });
    return { controlNumber, record };
  });

  const doc = buildCertificatePdf(branding, {
    controlNumber, issuedAt, examDate, name: parsed.data.name, address: parsed.data.address,
    complaints: parsed.data.complaints, diagnosis: parsed.data.diagnosis, remarks: parsed.data.remarks,
    doctorName: doctor.fullName, doctorTitle,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  doc.on("end", async () => {
    const buffer = Buffer.concat(chunks);

    await writeAudit({
      req, userId: doctor.id, action: "CREATE_CERTIFICATE", entityType: "CertificateVerificationRecord", entityId: record.id,
      details: { controlNumber, standalone: true },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="medical-certificate-${controlNumber}.pdf"`);
    res.setHeader("X-Control-Number", controlNumber);
    res.setHeader("Access-Control-Expose-Headers", "X-Control-Number");
    res.send(buffer);
  });
});

// Previously-issued certificates for an employee's profile tab.
certificatesRouter.get("/employee/:employeeId", async (req, res) => {
  const certificates = await prisma.medicalCertificate.findMany({
    where: { employeeId: req.params.employeeId },
    orderBy: { issuedAt: "desc" },
    include: { doctor: { select: { fullName: true } } },
  });
  res.json(certificates);
});

certificatesRouter.get("/:id/file", async (req, res) => {
  const certificate = await prisma.medicalCertificate.findUnique({ where: { id: req.params.id } });
  if (!certificate) return res.status(404).json({ error: "Certificate not found" });
  if (!fs.existsSync(certificate.pdfPath)) return res.status(404).json({ error: "File missing from storage" });

  await writeAudit({
    req, userId: req.currentUser!.id, action: "DOWNLOAD_DOC", entityType: "MedicalCertificate", entityId: certificate.id,
    employeeId: certificate.employeeId, details: { controlNumber: certificate.controlNumber },
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="medical-certificate-${certificate.controlNumber}.pdf"`);
  res.sendFile(path.resolve(certificate.pdfPath));
});

// Verification lookup — Admin, Doctor, Dentist, and Nurse only, enforced
// server-side. An employee certificate returns its full record; a
// standalone one returns only the minimal fields that were ever stored for
// it (nothing more exists to return).
certificatesRouter.get("/verify/:controlNumber", requireRole(...VERIFIER_ROLES), async (req, res) => {
  const controlNumber = req.params.controlNumber;

  const certificate = await prisma.medicalCertificate.findUnique({
    where: { controlNumber },
    include: { doctor: { select: { fullName: true } }, employee: { select: { employeeCode: true } } },
  });
  if (certificate) {
    return res.json({
      type: "EMPLOYEE",
      // Included so the verifier can pull up the actual PDF via the
      // existing GET /:id/file endpoint — all four verifier roles already
      // have full clinical access, so surfacing the document itself here
      // isn't a new privacy exposure, just a shortcut to what they could
      // already reach through the employee's profile.
      id: certificate.id,
      controlNumber: certificate.controlNumber,
      issuedAt: certificate.issuedAt,
      employeeCode: certificate.employee.employeeCode,
      name: certificate.name,
      address: certificate.address,
      examDate: certificate.examDate,
      complaints: certificate.complaints,
      diagnosis: certificate.diagnosis,
      remarks: certificate.remarks,
      doctorName: certificate.doctor.fullName,
      doctorTitle: certificate.doctorTitle,
    });
  }

  const record = await prisma.certificateVerificationRecord.findUnique({
    where: { controlNumber },
    include: { doctor: { select: { fullName: true } } },
  });
  if (record) {
    return res.json({
      type: "STANDALONE",
      controlNumber: record.controlNumber,
      issuedAt: record.issuedAt,
      doctorName: record.doctor.fullName,
    });
  }

  res.status(404).json({ error: "No certificate found with this control number" });
});
