-- AlterTable
ALTER TABLE "AnnualPhysicalExam" ADD COLUMN "hepaProfileResult" TEXT;
ALTER TABLE "AnnualPhysicalExam" ADD COLUMN "hepatitisScreeningResult" TEXT;
ALTER TABLE "AnnualPhysicalExam" ADD COLUMN "physicalExamFindings" TEXT;

-- CreateTable
CREATE TABLE "DrugTestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "testDate" DATETIME NOT NULL,
    "result" TEXT NOT NULL,
    "specimenType" TEXT,
    "labName" TEXT,
    "remarks" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DrugTestResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DrugTestResult_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PreEmploymentExam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "examDate" DATETIME,
    "provider" TEXT,
    "heightCm" REAL,
    "weightKg" REAL,
    "bmi" REAL,
    "bloodPressure" TEXT,
    "visionOD" TEXT,
    "visionOS" TEXT,
    "hearing" TEXT,
    "cbcResult" TEXT,
    "urinalysisResult" TEXT,
    "fecalysisResult" TEXT,
    "chestXrayResult" TEXT,
    "ecgResult" TEXT,
    "drugTestResult" TEXT,
    "pregnancyTestResult" TEXT,
    "medicalHistory" TEXT,
    "physicalExamFindings" TEXT,
    "otherFindings" TEXT,
    "significantFindings" TEXT,
    "recommendations" TEXT,
    "fitnessClassification" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PreEmploymentExam_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PreEmploymentExam_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DrugTestResult_employeeId_testDate_idx" ON "DrugTestResult"("employeeId", "testDate");

-- CreateIndex
CREATE INDEX "PreEmploymentExam_employeeId_examDate_idx" ON "PreEmploymentExam"("employeeId", "examDate");
