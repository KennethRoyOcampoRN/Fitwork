-- CreateTable
CREATE TABLE "ToothRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employeeId" TEXT NOT NULL,
    "toothNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'HEALTHY',
    "notes" TEXT,
    "updatedById" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ToothRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ToothRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ToothRecord_employeeId_idx" ON "ToothRecord"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "ToothRecord_employeeId_toothNumber_key" ON "ToothRecord"("employeeId", "toothNumber");
