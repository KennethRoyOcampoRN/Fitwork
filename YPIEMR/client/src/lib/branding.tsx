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
    primaryColor: settings?.primaryColor || "#D2571A",
    accentColor: settings?.accentColor || "#E4622B",
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
