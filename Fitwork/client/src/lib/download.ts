// Shared blob-download-via-anchor-click helper, extracted from the pattern
// duplicated across Reports.tsx, AdminReports.tsx, and EmployeeExportModal.tsx.
// Returns an error message on failure, or null on success.
export async function downloadFile(url: string, filename: string, init?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include", ...init });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "Download failed";
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
    return null;
  } catch {
    return "Download failed";
  }
}

export async function downloadFileViaPost(url: string, filename: string, body: unknown): Promise<string | null> {
  return downloadFile(url, filename, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
