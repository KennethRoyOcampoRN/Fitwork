-- CreateTable
CREATE TABLE "LabTestType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LabTestResult" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "testType" TEXT NOT NULL,
    "datePerformed" DATETIME NOT NULL,
    "findings" TEXT,
    "resultStatus" TEXT NOT NULL,
    "orderedById" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LabTestResult_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LabTestResult_orderedById_fkey" FOREIGN KEY ("orderedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LabTestType_name_key" ON "LabTestType"("name");

-- CreateIndex
CREATE INDEX "LabTestType_name_idx" ON "LabTestType"("name");

-- CreateIndex
CREATE INDEX "LabTestResult_employeeId_datePerformed_idx" ON "LabTestResult"("employeeId", "datePerformed");

-- CreateIndex
CREATE INDEX "LabTestResult_testType_idx" ON "LabTestResult"("testType");
