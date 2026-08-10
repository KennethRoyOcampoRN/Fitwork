import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

export interface BrandingSettings {
  hasLogo: boolean;
  hasBackground: boolean;
  primaryColor: string;
  accentColor: string;
  appName: string;
  appTagline: string;
  address: string | null;
  contactNumber: string | null;
  certificatePrefix: string | null;
  updatedAt: string | null;
}

interface BrandingContextValue {
  logoUrl: string | null;
  backgroundUrl: string | null;
  primaryColor: string;
  accentColor: string;
  appName: string;
  appTagline: string;
  address: string | null;
  contactNumber: string | null;
  certificatePrefix: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const BrandingContext = createContext<BrandingContextValue | null>(null);

// Automatic text contrast for the four *opaque* clinic-* surfaces
// (clinic-600/700 = accent, clinic-800/900 = primary — see
// tailwind.config.js) that buttons/badges/logo-preview panels render
// text directly on top of. Everything else derived from --clinic-primary/
// --clinic-accent (clinic-50..500, .nav-active, .brand-chip) is blended
// toward white or rendered as a translucent tint over the dark glass
// background, so it stays legible regardless of the admin's chosen hue —
// only these four can end up as a literal near-white or near-black solid
// fill, which is where hardcoded `text-white` can go invisible.
function mixSrgbHex(hexA: string, pctA: number, hexB: string): [number, number, number] {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  const t = pctA / 100;
  return [a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t)];
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [255, 255, 255];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

// WCAG relative luminance — light backgrounds (L above the ~0.4 practical
// midpoint, a bit under the textbook 0.5 since dark ink reads comfortably
// on medium-light fills too) get dark ink text, everything else gets the
// theme's off-white.
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrastTextFor(rgb: [number, number, number]): string {
  return relativeLuminance(rgb) > 0.4 ? "var(--text-ink)" : "var(--text-offwhite)";
}

function applyContrastTokens(primary: string, accent: string) {
  const root = document.documentElement.style;
  root.setProperty("--clinic-600-fg", contrastTextFor(parseHex(accent)));
  root.setProperty("--clinic-700-fg", contrastTextFor(mixSrgbHex(accent, 85, "#000000")));
  root.setProperty("--clinic-800-fg", contrastTextFor(parseHex(primary)));
  root.setProperty("--clinic-900-fg", contrastTextFor(mixSrgbHex(primary, 80, "#000000")));
}

// Public endpoint — no auth required, since the Login page needs branding
// before a session exists. Fetched once at app mount (and again after an
// admin saves changes) and applied as CSS custom properties on the root
// element, so every `clinic-*` Tailwind utility re-themes live, no rebuild.
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BrandingSettings | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      const s = await api.get<BrandingSettings>("/settings/branding");
      setSettings(s);
      document.documentElement.style.setProperty("--clinic-primary", s.primaryColor);
      document.documentElement.style.setProperty("--clinic-accent", s.accentColor);
      applyContrastTokens(s.primaryColor, s.accentColor);
      document.title = s.appName;
    } catch {
      // Network/DB hiccup — the CSS defaults in index.css already cover this.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const version = settings?.updatedAt ? encodeURIComponent(settings.updatedAt) : "0";
  const value: BrandingContextValue = {
    logoUrl: settings?.hasLogo ? `/api/settings/branding/logo?v=${version}` : null,
    backgroundUrl: settings?.hasBackground ? `/api/settings/branding/background?v=${version}` : null,
    primaryColor: settings?.primaryColor || "#08514E",
    accentColor: settings?.accentColor || "#ffffff",
    appName: settings?.appName || "FitWork",
    appTagline: settings?.appTagline || "by Clinicore — Employee Health Records System",
    address: settings?.address ?? null,
    contactNumber: settings?.contactNumber ?? null,
    certificatePrefix: settings?.certificatePrefix ?? null,
    loading,
    refresh,
  };

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding() {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error("useBranding must be used within BrandingProvider");
  return ctx;
}
