-- CreateTable
CREATE TABLE "DocumentLabel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLabel_category_name_key" ON "DocumentLabel"("category", "name");

-- CreateIndex
CREATE INDEX "DocumentLabel_category_idx" ON "DocumentLabel"("category");

-- AlterTable
ALTER TABLE "MedicalDocument" ADD COLUMN "labelId" TEXT REFERENCES "DocumentLabel" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "MedicalDocument_labelId_idx" ON "MedicalDocument"("labelId");

-- Data migration: auto-create a label for every (category, title) pair that
-- has 2+ exact-match documents, and link all of them to it. Titles with no
-- exact-match sibling (typos/one-off variations) are left with labelId NULL
-- for manual review — see GET /api/documents/needs-label.
INSERT INTO "DocumentLabel" ("id", "category", "name", "createdAt")
SELECT lower(hex(randomblob(16))), "category", "title", CURRENT_TIMESTAMP
FROM "MedicalDocument"
GROUP BY "category", "title"
HAVING COUNT(*) >= 2;

UPDATE "MedicalDocument"
SET "labelId" = (
  SELECT "dl"."id" FROM "DocumentLabel" "dl"
  WHERE "dl"."category" = "MedicalDocument"."category" AND "dl"."name" = "MedicalDocument"."title"
)
WHERE EXISTS (
  SELECT 1 FROM "DocumentLabel" "dl"
  WHERE "dl"."category" = "MedicalDocument"."category" AND "dl"."name" = "MedicalDocument"."title"
);
