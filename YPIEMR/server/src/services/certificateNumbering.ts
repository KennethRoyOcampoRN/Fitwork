import { Prisma, PrismaClient } from "@prisma/client";

// Allocates the next sequential control number for the given year, e.g.
// "YPI-2026-000142". `prefix` is the caller's already-resolved effective
// prefix (admin-configured or derived from the clinic name — see
// certificatePrefix.ts) — deliberately not looked up here, so this stays a
// pure "allocate the next number" function and every certificate stamps
// whatever prefix was current at the moment it was issued, even if the
// clinic is later renamed. Must be called with a Prisma transaction client
// (the `tx` param of prisma.$transaction(async (tx) => ...)) — both
// certificate types (employee-linked and standalone) call this from inside
// the same transaction as their own record's creation, so the counter
// increment and the certificate write commit or roll back together: a
// failed certificate write can never leave a gap where a control number was
// allocated but no certificate exists for it, or vice versa. The counter
// itself is shared across both certificate types and is not scoped by
// prefix, so a mid-year rename doesn't reset or fork the sequence.
export async function nextControlNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  prefix: string,
  year: number = new Date().getFullYear()
): Promise<string> {
  const counter = await tx.certificateCounter.upsert({
    where: { year },
    create: { year, count: 1 },
    update: { count: { increment: 1 } },
  });
  const padded = String(counter.count).padStart(6, "0");
  return `${prefix}-${year}-${padded}`;
}
