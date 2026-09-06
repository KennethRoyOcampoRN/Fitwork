-- Snapshot the author's (and voider's) name at write time, instead of
-- always resolving it live through a join to User.fullName. Without this,
-- an admin correcting a typo in someone's name (see the User full
-- name/username edit feature) would silently rewrite the byline on every
-- past note that person ever wrote or voided, the moment the correction is
-- saved — the same problem the self-edit time window already guards
-- against for clinical content, applied here to authorship instead.

-- AlterTable
ALTER TABLE "ClinicalNote" ADD COLUMN "authorNameSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ClinicalNote" ADD COLUMN "voidedByNameSnapshot" TEXT;

-- AlterTable
ALTER TABLE "NoteAddendum" ADD COLUMN "authorNameSnapshot" TEXT NOT NULL DEFAULT '';

-- Backfill every existing row from the current live data — the best
-- information available at migration time. Any note whose author's name
-- was already corrected before this migration ran will backfill with the
-- (already-changed) current name; there's no way to recover what the name
-- looked like at original write time for rows written before this column
-- existed. Everything created after this migration gets the real
-- at-write-time value from the application, not this fallback.
UPDATE "ClinicalNote"
SET "authorNameSnapshot" = (SELECT "fullName" FROM "User" WHERE "User"."id" = "ClinicalNote"."authorId");

UPDATE "ClinicalNote"
SET "voidedByNameSnapshot" = (SELECT "fullName" FROM "User" WHERE "User"."id" = "ClinicalNote"."voidedById")
WHERE "voidedById" IS NOT NULL;

UPDATE "NoteAddendum"
SET "authorNameSnapshot" = (SELECT "fullName" FROM "User" WHERE "User"."id" = "NoteAddendum"."authorId");
