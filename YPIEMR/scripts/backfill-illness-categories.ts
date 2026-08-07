/**
 * One-time historical backfill for the illness/condition category field used
 * by the department and age reports. Run with: npm run backfill-categories
 *
 * Idempotent — only touches ClinicalNote rows where illnessCategory is still
 * null, so it's safe to re-run (e.g. after adding new keywords). Every row it
 * touches is marked illnessCategoryNeedsReview=true, since nobody has looked
 * at the auto-suggested category yet (unlike categories chosen at charting
 * time, which the clinician already saw before submitting).
 */
import "../server/src/env";
import { PrismaClient } from "@prisma/client";
import { suggestIllnessCategory } from "../server/src/services/illnessCategories";

const prisma = new PrismaClient();

async function main() {
  const candidates = await prisma.clinicalNote.findMany({
    where: {
      illnessCategory: null,
      OR: [
        { diagnosis: { not: null } },
        { nursingDiagnosis: { not: null } },
      ],
    },
    select: { id: true, diagnosis: true, nursingDiagnosis: true },
  });

  console.log(`Found ${candidates.length} note(s) with no illness category yet.`);

  let categorized = 0;
  let skipped = 0;

  for (const note of candidates) {
    const category = suggestIllnessCategory(note.diagnosis || note.nursingDiagnosis);
    if (!category) {
      skipped++;
      continue;
    }
    await prisma.clinicalNote.update({
      where: { id: note.id },
      data: { illnessCategory: category, illnessCategoryNeedsReview: true },
    });
    categorized++;
  }

  console.log(`Categorized ${categorized} note(s) (flagged for review). ${skipped} had no keyword match and were left uncategorized.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
