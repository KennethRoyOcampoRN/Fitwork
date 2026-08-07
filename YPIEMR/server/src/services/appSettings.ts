import { prisma } from "../lib/prisma";

// Single source of truth for the app/company display name — used by both
// the UI (via routes/settings.ts's /api/settings/branding) and PDF chart
// exports (via clinicReportPdf.ts), so a name change in Admin > Settings
// applies everywhere the name appears, with no separate env-var-only path
// left inconsistent with it.
export const DEFAULT_APP_NAME = "FitWork";

const SETTINGS_ID = "singleton";

export async function getAppName(): Promise<string> {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.appName || DEFAULT_APP_NAME;
}
