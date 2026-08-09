-- CreateTable
CREATE TABLE "ClinicSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "logoPath" TEXT,
    "backgroundPath" TEXT,
    "primaryColor" TEXT,
    "accentColor" TEXT,
    "updatedAt" DATETIME NOT NULL
);
