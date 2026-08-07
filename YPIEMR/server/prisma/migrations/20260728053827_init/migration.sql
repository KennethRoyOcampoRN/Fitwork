-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "licenseNumber" TEXT,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" DATETIME,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "idleExpiresAt" DATETIME NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeCode" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "suffix" TEXT,
    "dateOfBirth" DATETIME,
    "sex" TEXT,
    "civilStatus" TEXT,
    "bloodType" TEXT,
    "department" TEXT,
    "position" TEXT,
    "employmentStatus" TEXT,
    "dateHired" DATETIME,
    "mobileNumber" TEXT,
    "address" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactRelation" TEXT,
    "emergencyContactNumber" TEXT,
    "photoPath" TEXT,
    "photoThumbPath" TEXT,
    "knownAllergies" TEXT,
    "chronicConditions" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "VitalsRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "heightCm" REAL,
    "weightKg" REAL,
    "bmi" REAL,
    "bmiCategory" TEXT,
    "systolic" INTEGER,
    "diastolic" INTEGER,
    "pulseRate" INTEGER,
    "respiratoryRate" INTEGER,
    "temperatureC" REAL,
    "oxygenSaturation" INTEGER,
    "remarks" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VitalsRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VitalsRecord_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "visitDateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitCategory" TEXT,
    "chiefComplaint" TEXT,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "disposition" TEXT,
    "referredTo" TEXT,
    "followUpDate" DATETIME,
    "isWorkRelated" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'FINAL',
    "voidReason" TEXT,
    "voidedById" TEXT,
    "voidedAt" DATETIME,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "legacyAuthorName" TEXT,
    "editableUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClinicalNote_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicalNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ClinicalNote_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL,
    "afterJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteRevision_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NoteRevision_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NoteAddendum" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "noteId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NoteAddendum_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NoteAddendum_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MedicationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "noteId" TEXT,
    "dispensedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispensedById" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "strength" TEXT,
    "dosageForm" TEXT,
    "route" TEXT,
    "frequency" TEXT,
    "quantityDispensed" TEXT,
    "indication" TEXT,
    "remarks" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archiveReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicationLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicationLog_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "ClinicalNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MedicationLog_dispensedById_fkey" FOREIGN KEY ("dispensedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MedicalDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentDate" DATETIME,
    "filePath" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "notes" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archiveReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MedicalDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MedicalDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AnnualPhysicalExam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "examYear" INTEGER NOT NULL,
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
    "otherFindings" TEXT,
    "significantFindings" TEXT,
    "recommendations" TEXT,
    "fitnessClassification" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AnnualPhysicalExam_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AnnualPhysicalExam_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AnnualPhysicalExam_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "MedicalDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "APETemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "importType" TEXT NOT NULL DEFAULT 'APE',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "APETemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "APETemplateField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "optionsJson" TEXT,
    "unit" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "mapsToCoreColumn" TEXT,
    CONSTRAINT "APETemplateField_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "APETemplate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "APEFieldValue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "apeId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "valueText" TEXT,
    "valueNumber" REAL,
    "valueDate" DATETIME,
    "valueBool" BOOLEAN,
    CONSTRAINT "APEFieldValue_apeId_fkey" FOREIGN KEY ("apeId") REFERENCES "AnnualPhysicalExam" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT,
    "importType" TEXT NOT NULL,
    "importedById" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRY_RUN',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "errorLogJson" TEXT,
    "templateId" TEXT,
    "templateVersion" INTEGER,
    CONSTRAINT "ImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "employeeId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "detailsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AuditLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");

-- CreateIndex
CREATE INDEX "Employee_employeeCode_idx" ON "Employee"("employeeCode");

-- CreateIndex
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Employee_department_idx" ON "Employee"("department");

-- CreateIndex
CREATE INDEX "VitalsRecord_employeeId_recordedAt_idx" ON "VitalsRecord"("employeeId", "recordedAt");

-- CreateIndex
CREATE INDEX "ClinicalNote_employeeId_visitDateTime_idx" ON "ClinicalNote"("employeeId", "visitDateTime");

-- CreateIndex
CREATE INDEX "ClinicalNote_noteType_idx" ON "ClinicalNote"("noteType");

-- CreateIndex
CREATE INDEX "ClinicalNote_authorId_idx" ON "ClinicalNote"("authorId");

-- CreateIndex
CREATE INDEX "NoteRevision_noteId_idx" ON "NoteRevision"("noteId");

-- CreateIndex
CREATE INDEX "NoteAddendum_noteId_idx" ON "NoteAddendum"("noteId");

-- CreateIndex
CREATE INDEX "MedicationLog_employeeId_dispensedAt_idx" ON "MedicationLog"("employeeId", "dispensedAt");

-- CreateIndex
CREATE INDEX "MedicalDocument_employeeId_category_idx" ON "MedicalDocument"("employeeId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "AnnualPhysicalExam_employeeId_examYear_key" ON "AnnualPhysicalExam"("employeeId", "examYear");

-- CreateIndex
CREATE UNIQUE INDEX "APETemplate_name_version_key" ON "APETemplate"("name", "version");

-- CreateIndex
CREATE INDEX "APETemplateField_templateId_idx" ON "APETemplateField"("templateId");

-- CreateIndex
CREATE INDEX "APEFieldValue_apeId_fieldKey_idx" ON "APEFieldValue"("apeId", "fieldKey");

-- CreateIndex
CREATE INDEX "ImportBatch_importType_idx" ON "ImportBatch"("importType");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_employeeId_idx" ON "AuditLog"("employeeId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
