-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClinicalNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "visitDateTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitCategory" TEXT,
    "chiefComplaint" TEXT,
    "assessment" TEXT,
    "diagnosis" TEXT,
    "treatment" TEXT,
    "recommendation" TEXT,
    "nursingDiagnosis" TEXT,
    "plan" TEXT,
    "intervention" TEXT,
    "evaluation" TEXT,
    "illnessCategory" TEXT,
    "illnessCategoryNeedsReview" BOOLEAN NOT NULL DEFAULT false,
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
INSERT INTO "new_ClinicalNote" ("assessment", "authorId", "chiefComplaint", "createdAt", "diagnosis", "disposition", "editableUntil", "employeeId", "evaluation", "followUpDate", "id", "intervention", "isWorkRelated", "legacyAuthorName", "noteType", "nursingDiagnosis", "plan", "recommendation", "referredTo", "sourceType", "status", "treatment", "updatedAt", "visitCategory", "visitDateTime", "voidReason", "voidedAt", "voidedById") SELECT "assessment", "authorId", "chiefComplaint", "createdAt", "diagnosis", "disposition", "editableUntil", "employeeId", "evaluation", "followUpDate", "id", "intervention", "isWorkRelated", "legacyAuthorName", "noteType", "nursingDiagnosis", "plan", "recommendation", "referredTo", "sourceType", "status", "treatment", "updatedAt", "visitCategory", "visitDateTime", "voidReason", "voidedAt", "voidedById" FROM "ClinicalNote";
DROP TABLE "ClinicalNote";
ALTER TABLE "new_ClinicalNote" RENAME TO "ClinicalNote";
CREATE INDEX "ClinicalNote_employeeId_visitDateTime_idx" ON "ClinicalNote"("employeeId", "visitDateTime");
CREATE INDEX "ClinicalNote_noteType_idx" ON "ClinicalNote"("noteType");
CREATE INDEX "ClinicalNote_authorId_idx" ON "ClinicalNote"("authorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
