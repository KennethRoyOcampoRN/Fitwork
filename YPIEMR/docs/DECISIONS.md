# FITWORK — Decisions log

Tracks every "DECISION NEEDED" item from the build spec and how it was resolved during implementation.

| # | Decision | Resolution |
|---|---|---|
| 1 | Preferred stack | Confirmed — Node 20 / Express+TS / Prisma / SQLite / React+Vite+TS+Tailwind, single-port deployment (§3). |
| 2 | Self-correction window on notes | Confirmed — 15 minutes, author-only, full before/after revision snapshot on every edit, enforced in the service layer via `SELF_EDIT_WINDOW_MINUTES` (default 15). |
| 3 | BMI standard | Asia-Pacific WHO cutoffs (default), implemented in `server/src/services/bmi.ts`: Underweight <18.5, Normal 18.5–22.9, Overweight 23.0–24.9, Obese I 25.0–29.9, Obese II ≥30.0. |
| 4 | Exact APE Excel columns | App-generated workbook approach per §8 — admin defines fields via the template builder (Phase 5), no fixed column list. |
| 5 | Concurrent users / headcount | 1–5 concurrent users confirmed; headcount assumed ≤5,000 (no schema impact — `employeeCode` is indexed). |
| 6 | Employee master list source | Manual entry + periodic Excel import (`EMPLOYEES` import type, Phase 5), no live HR integration. |
| 7 | Server OS / static LAN IP | Assumed Windows 11/Server with a static IP; PM2 + Windows service instructions in `docs/INSTALL.md` (Phase 6). |
| 8 | Nightly backup destination | Default `D:\fitwork-backups`, configurable via `BACKUP_DIR` env var (Phase 6). |

## Implementation notes / deviations worth flagging

- **shadcn/ui**: the spec calls for shadcn/ui, but generating its component set requires network access to the shadcn CLI registry, which conflicts with the "no CDN, offline-first" constraint (C1) for a from-scratch build in this environment. The MVP instead uses hand-written Tailwind components with the same visual language (rounded cards, `clinic` color scale). Swapping in real shadcn/ui components later is a drop-in change — none of the component APIs are exposed outside their own files.
- **Roles/enums**: Prisma + SQLite has no native enum type, so `role`, `noteType`, etc. are stored as `String` and validated with Zod at the API boundary. This keeps the schema Postgres-compatible (Postgres enums can be introduced later without changing application code).
- **Search case-insensitivity**: SQLite's default `LIKE`/`=` comparison is already case-insensitive for ASCII, so Prisma's `mode: "insensitive"` (Postgres/MySQL-only) is intentionally not used.
