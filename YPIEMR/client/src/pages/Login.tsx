import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth, ApiError } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { IconSpinner } from "../components/icons";

export default function Login() {
  const { login } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  const inputClass =
    "w-full border border-gray-300 rounded-md px-3 py-2 text-gray-900 transition-all duration-200 " +
    "focus:outline-none focus:border-clinic-500 focus:ring-4 focus:ring-clinic-400/25";

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-clinic-900 px-4 bg-cover bg-center"
      style={branding.backgroundUrl ? {
        backgroundImage: `linear-gradient(rgba(10, 20, 30, 0.55), rgba(10, 20, 30, 0.55)), url(${branding.backgroundUrl})`,
      } : undefined}
    >
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6 animate-fade-in-up">
          {branding.logoUrl ? (
            <div className="h-20 w-56 flex items-center justify-center mb-3">
              <img src={branding.logoUrl} alt={`${branding.appName} logo`} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <img src="/logo-icon.png" alt="FitWork" className="w-14 h-14 mb-3 object-contain" />
          )}
          <h1 className="text-2xl font-semibold text-white tracking-wide">{branding.appName}</h1>
          <p className="text-sm text-clinic-200">{branding.appTagline}</p>
        </div>

        <div
          className="bg-white rounded-xl shadow-xl overflow-hidden animate-fade-in-up"
          style={{ animationDelay: "150ms" }}
        >
          <div className="h-1.5 bg-clinic-600" />
          <div className="p-8">
            <h2 className="text-lg font-semibold text-clinic-800 mb-4">Sign in</h2>

            {expired && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-4">
                Your session expired. Please sign in again.
              </p>
            )}

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  className={inputClass}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              {error && (
                <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-clinic-600 hover:bg-clinic-700 text-white rounded-md py-2.5 font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy && <IconSpinner className="w-4 h-4" />}
                {busy ? "Signing in..." : "Sign in"}
              </button>
            </form>
          </div>

          <div className="px-8 py-3 bg-gray-50 border-t border-gray-100">
            <p className="text-[11px] leading-snug text-gray-400 text-center">
              Authorized clinic personnel only. All access is logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
