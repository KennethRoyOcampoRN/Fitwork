import React, { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";

interface LastBackup {
  timestamp: string;
  dbBackupPath: string;
  zipBackupPath: string;
  verifiedCounts: { users: number; employees: number };
  completedAt: string;
  isStale: boolean;
}

interface BackupStatusResponse {
  backupDir: string;
  lastBackup: LastBackup | null;
}

export default function AdminBackup() {
  const [status, setStatus] = useState<BackupStatusResponse | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openAttempted, setOpenAttempted] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    setStatus(await api.get<BackupStatusResponse>("/backup/status"));
  }
  useEffect(() => { load(); }, []);

  async function runNow() {
    setBusy(true);
    setError(null);
    try {
      await api.post("/backup/run");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Backup failed");
    } finally {
      setBusy(false);
    }
  }

  async function openFolder() {
    setOpenAttempted(false);
    try {
      await api.post("/backup/open-folder");
      setOpenAttempted(true);
    } catch {
      setOpenAttempted(true);
    }
  }

  async function copyPath() {
    if (!status) return;
    await navigator.clipboard.writeText(status.backupDir);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const lastBackup = status?.lastBackup;

  return (
    <div className="max-w-lg">
      <h2 className="font-medium mb-3">Backup</h2>

      <div className={`border rounded-lg p-4 mb-4 ${lastBackup?.isStale ? "bg-red-50 border-red-200" : "bg-white"}`}>
        {status === undefined && <p className="text-sm text-gray-400">Loading...</p>}
        {status && lastBackup === null && <p className="text-sm text-red-700">No backup has ever run on this server.</p>}
        {lastBackup && (
          <>
            <p className={`text-sm font-medium ${lastBackup.isStale ? "text-red-700" : "text-green-700"}`}>
              Last successful backup: {new Date(lastBackup.completedAt).toLocaleString()}
              {lastBackup.isStale && " — more than 48 hours ago!"}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Verified {lastBackup.verifiedCounts.users} users, {lastBackup.verifiedCounts.employees} employees in the backup copy.
            </p>
          </>
        )}
      </div>

      <button onClick={runNow} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">
        {busy ? "Running backup..." : "Run backup now"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      <p className="text-xs text-gray-500 mt-4">
        Automated nightly backups should be scheduled at 22:00 via the OS task scheduler
        (see docs/INSTALL.md). This button runs the same backup on demand.
      </p>

      {status && (
        <div className="border rounded-lg p-4 mt-4 bg-white">
          <h3 className="text-sm font-medium mb-2">Backup folder location</h3>
          <p className="text-xs text-gray-500 mb-2">
            Copy files from here to wherever your company wants an offsite copy (e.g. a shared HRD drive) — FITWORK never
            writes backups directly to a network location itself.
          </p>
          <code className="block text-xs bg-gray-50 border rounded px-2 py-1.5 mb-3 break-all">{status.backupDir}</code>
          <div className="flex gap-2 items-center flex-wrap">
            <button onClick={openFolder} className="bg-gray-600 text-white rounded px-3 py-1.5 text-sm">
              Open backups folder
            </button>
            <button onClick={copyPath} className="border rounded px-3 py-1.5 text-sm">
              {copied ? "Copied!" : "Copy path"}
            </button>
          </div>
          {openAttempted && (
            <p className="text-xs text-gray-500 mt-2">
              If a window didn't open (e.g. this server is running as a background service), copy the path above and
              navigate there manually in File Explorer.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
