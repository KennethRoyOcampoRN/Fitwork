-- AlterTable
ALTER TABLE "ClinicSettings" ADD COLUMN "address" TEXT;
ALTER TABLE "ClinicSettings" ADD COLUMN "contactNumber" TEXT;

-- CreateTable
CREATE TABLE "CertificateCounter" (
    "year" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "count" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "MedicalCertificate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "examDate" DATETIME NOT NULL,
    "complaints" TEXT NOT NULL,
    "diagnosis" TEXT NOT NULL,
    "remarks" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "doctorTitle" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalCertificate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicalCertificate_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CertificateVerificationRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "controlNumber" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CertificateVerificationRecord_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalCertificate_controlNumber_key" ON "MedicalCertificate"("controlNumber");

-- CreateIndex
CREATE INDEX "MedicalCertificate_employeeId_idx" ON "MedicalCertificate"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateVerificationRecord_controlNumber_key" ON "CertificateVerificationRecord"("controlNumber");
