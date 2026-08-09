// Minimal structural shape both `prisma` (outside a transaction) and `tx`
// (inside prisma.$transaction) satisfy — avoids fighting Prisma's generated
// PrismaClient vs. TransactionClient types for a helper that only ever
// touches the Company model.
interface CompanyDataSource {
  company: {
    findMany: (args: { select: { id: true; name: true } }) => Promise<{ id: string; name: string }[]>;
    create: (args: { data: { name: string } }) => Promise<{ id: string; name: string }>;
  };
}

// SQLite's UNIQUE index on Company.name is case-sensitive (BINARY collation)
// by default, so "ABC Manpower", "abc manpower", and "ABC MANPOWER " would
// otherwise create three separate rows for the same agency. Every path that
// resolves or creates a Company from free-text input (the Agency combobox,
// the Employees bulk import, the admin Companies list) must go through this
// helper instead of a raw Prisma upsert/create, so the same agency always
// resolves to the same row regardless of how its name was typed.
export async function resolveOrCreateCompany(
  db: CompanyDataSource,
  rawName: string
): Promise<{ id: string; name: string }> {
  const trimmed = rawName.trim();
  const normalized = trimmed.toLowerCase();

  const candidates = await db.company.findMany({ select: { id: true, name: true } });
  const existing = candidates.find((c) => c.name.trim().toLowerCase() === normalized);
  if (existing) return existing;

  return db.company.create({ data: { name: trimmed } });
}
