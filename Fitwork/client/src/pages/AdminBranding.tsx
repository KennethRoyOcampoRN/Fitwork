import React, { useEffect, useState } from "react";
import { useBranding } from "../lib/branding";
import { ApiError } from "../lib/api";
import { deriveCertificatePrefix } from "../lib/certificatePrefix";
import ConfirmModal from "../components/ConfirmModal";

const DEFAULT_PRIMARY = "#08514E";
const DEFAULT_ACCENT = "#ffffff";
const DEFAULT_APP_NAME = "FitWork";
const DEFAULT_APP_TAGLINE = "by Clinicore — Employee Health Records System";

export default function AdminBranding() {
  const branding = useBranding();
  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [appName, setAppName] = useState(DEFAULT_APP_NAME);
  const [appTagline, setAppTagline] = useState(DEFAULT_APP_TAGLINE);
  const [address, setAddress] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [certificatePrefix, setCertificatePrefix] = useState("");
  // Once the admin has an explicit value (either saved already, or they've
  // typed into the short-code field directly), stop overwriting it whenever
  // the clinic name changes — the auto-fill is a one-time suggestion, not a
  // live-synced derivation.
  const [prefixTouched, setPrefixTouched] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [backgroundPreview, setBackgroundPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);

  // Seed the form from whatever's currently active, once branding has loaded.
  useEffect(() => {
    if (!branding.loading) {
      setPrimaryColor(branding.primaryColor);
      setAccentColor(branding.accentColor);
      setAppName(branding.appName);
      setAppTagline(branding.appTagline);
      setAddress(branding.address || "");
      setContactNumber(branding.contactNumber || "");
      if (branding.certificatePrefix) {
        // Already configured (accepted default or admin-customized) — treat
        // as touched so it isn't silently overwritten by a later name edit.
        setCertificatePrefix(branding.certificatePrefix);
        setPrefixTouched(true);
      } else {
        setCertificatePrefix(deriveCertificatePrefix(branding.appName));
        setPrefixTouched(false);
      }
    }
  }, [branding.loading, branding.primaryColor, branding.accentColor, branding.appName, branding.appTagline, branding.address, branding.contactNumber, branding.certificatePrefix]);

  function onAppNameChange(value: string) {
    setAppName(value);
    if (!prefixTouched) setCertificatePrefix(deriveCertificatePrefix(value));
  }
  function onCertificatePrefixChange(value: string) {
    setCertificatePrefix(value.toUpperCase());
    setPrefixTouched(true);
  }

  function onLogoChange(file: File | null) {
    setLogoFile(file);
    setLogoPreview(file ? URL.createObjectURL(file) : null);
  }
  function onBackgroundChange(file: File | null) {
    setBackgroundFile(file);
    setBackgroundPreview(file ? URL.createObjectURL(file) : null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const form = new FormData();
      form.append("primaryColor", primaryColor);
      form.append("accentColor", accentColor);
      form.append("appName", appName);
      form.append("appTagline", appTagline);
      form.append("address", address);
      form.append("contactNumber", contactNumber);
      form.append("certificatePrefix", certificatePrefix);
      if (logoFile) form.append("logo", logoFile);
      if (backgroundFile) form.append("background", backgroundFile);

      const res = await fetch("/api/settings/branding", { method: "POST", credentials: "include", body: form });
      if (!res.ok) throw new ApiError(res.status, (await res.json()).error || "Could not save branding");

      setLogoFile(null);
      setBackgroundFile(null);
      setLogoPreview(null);
      setBackgroundPreview(null);
      await branding.refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save branding");
    } finally {
      setBusy(false);
    }
  }

  async function resetToDefaults() {
    setShowResetModal(false);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/branding", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new ApiError(res.status, (await res.json()).error || "Could not reset branding");
      setPrimaryColor(DEFAULT_PRIMARY);
      setAccentColor(DEFAULT_ACCENT);
      setAppName(DEFAULT_APP_NAME);
      setAppTagline(DEFAULT_APP_TAGLINE);
      setAddress("");
      setContactNumber("");
      setCertificatePrefix(deriveCertificatePrefix(DEFAULT_APP_NAME));
      setPrefixTouched(false);
      onLogoChange(null);
      onBackgroundChange(null);
      await branding.refresh();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset branding");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <p className="text-sm text-gray-500 mb-4">
        Customize the app name, logo, login background, and brand colors. Changes apply immediately across the app
        for every user — no restart needed.
      </p>

      <form onSubmit={save} className="bg-white border rounded-xl p-4 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">Clinic/Company name</label>
            <input
              value={appName}
              onChange={(e) => onAppNameChange(e.target.value)}
              placeholder={DEFAULT_APP_NAME}
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={80}
            />
            <p className="text-xs text-gray-400 mt-1">Replaces "{DEFAULT_APP_NAME}" in the sidebar header, login page, and browser tab title.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Tagline / subtitle</label>
            <input
              value={appTagline}
              onChange={(e) => setAppTagline(e.target.value)}
              placeholder={DEFAULT_APP_TAGLINE}
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={120}
            />
            <p className="text-xs text-gray-400 mt-1">Shown under the name on the login page.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">Clinic address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="123 Main St, City"
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={200}
            />
            <p className="text-xs text-gray-400 mt-1">Shown in the letterhead of generated medical certificates.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Contact number</label>
            <input
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              placeholder="(02) 8123 4567"
              className="w-full border rounded px-2 py-1.5 text-sm"
              maxLength={60}
            />
            <p className="text-xs text-gray-400 mt-1">Shown in the letterhead of generated medical certificates.</p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Certificate short code</label>
          <input
            value={certificatePrefix}
            onChange={(e) => onCertificatePrefixChange(e.target.value)}
            placeholder="YPI"
            className="w-32 border rounded px-2 py-1.5 text-sm font-mono uppercase"
            maxLength={6}
          />
          <p className="text-xs text-gray-400 mt-1">
            The prefix on every medical certificate's control number, e.g. "{certificatePrefix || "YPI"}-2026-000142".
            2-6 letters/digits. Auto-suggested from the clinic name above — edit it to anything you'd rather use.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Logo</label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-40 rounded-lg bg-clinic-900 flex items-center justify-center overflow-hidden shrink-0">
              {logoPreview || branding.logoUrl ? (
                <img src={logoPreview || branding.logoUrl || undefined} className="max-h-full max-w-full object-contain" />
              ) : (
                <span className="text-xs">Default</span>
              )}
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onLogoChange(e.target.files?.[0] || null)} className="text-sm" />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Replaces the shield/pulse mark in the sidebar header and login page. Both display it in a wider,
            properly-proportioned box (not a small square) — the logo is scaled to fit within it, never stretched or
            squished, so a wide horizontal logo and a tall/square mark both display correctly.
            PNG with a transparent background recommended — the logo will blend into the sidebar/login background
            instead of sitting on its own visible patch. When the sidebar is collapsed to icon-only width, the
            default {DEFAULT_APP_NAME} mark is shown instead of a shrunk copy of your logo, since arbitrary logos
            don't crop reliably down to icon size.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Login background</label>
          <div className="flex items-center gap-3">
            <div className="w-24 h-14 rounded-lg bg-gray-100 border overflow-hidden shrink-0">
              {backgroundPreview || branding.backgroundUrl ? (
                <img src={backgroundPreview || branding.backgroundUrl || undefined} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">Default</div>
              )}
            </div>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onBackgroundChange(e.target.files?.[0] || null)} className="text-sm" />
          </div>
          <p className="text-xs text-gray-400 mt-1">Shown behind the sign-in card on the login page.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-2">Primary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="w-10 h-9 border rounded cursor-pointer" />
              <input
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="flex-1 border rounded px-2 py-1.5 text-sm font-mono"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Header, nav bar, and dark accents.</p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Accent color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} className="w-10 h-9 border rounded cursor-pointer" />
              <input
                value={accentColor}
                onChange={(e) => setAccentColor(e.target.value)}
                className="flex-1 border rounded px-2 py-1.5 text-sm font-mono"
                pattern="^#[0-9a-fA-F]{6}$"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">Buttons, links, and highlights.</p>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {saved && !error && <p className="text-sm text-green-700">Branding saved.</p>}

        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
            {busy ? "Saving..." : "Save branding"}
          </button>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            disabled={busy}
            className="border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Reset to defaults
          </button>
        </div>
      </form>

      {showResetModal && (
        <ConfirmModal
          title="Reset branding to defaults?"
          confirmLabel="Reset"
          onConfirm={resetToDefaults}
          onCancel={() => setShowResetModal(false)}
        >
          <p className="text-sm text-gray-700">
            This resets the logo, background, colors, and app name back to the default "{DEFAULT_APP_NAME}" branding.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
