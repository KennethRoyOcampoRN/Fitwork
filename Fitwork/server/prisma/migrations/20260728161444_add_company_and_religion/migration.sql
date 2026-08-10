-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Employee" (
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
    "religion" TEXT,
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
    "updatedAt" DATETIME NOT NULL,
    "companyId" TEXT,
    CONSTRAINT "Employee_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("address", "bloodType", "chronicConditions", "civilStatus", "createdAt", "dateHired", "dateOfBirth", "department", "emergencyContactName", "emergencyContactNumber", "emergencyContactRelation", "employeeCode", "employmentStatus", "firstName", "id", "isActive", "knownAllergies", "lastName", "middleName", "mobileNumber", "photoPath", "photoThumbPath", "position", "sex", "suffix", "updatedAt") SELECT "address", "bloodType", "chronicConditions", "civilStatus", "createdAt", "dateHired", "dateOfBirth", "department", "emergencyContactName", "emergencyContactNumber", "emergencyContactRelation", "employeeCode", "employmentStatus", "firstName", "id", "isActive", "knownAllergies", "lastName", "middleName", "mobileNumber", "photoPath", "photoThumbPath", "position", "sex", "suffix", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_employeeCode_key" ON "Employee"("employeeCode");
CREATE INDEX "Employee_employeeCode_idx" ON "Employee"("employeeCode");
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");
CREATE INDEX "Employee_department_idx" ON "Employee"("department");
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");

-- CreateIndex
CREATE INDEX "Company_name_idx" ON "Company"("name");
