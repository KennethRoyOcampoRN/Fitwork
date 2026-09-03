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

// Prints an already-generated blob (as an object URL) without an extra
// fetch — for callers that already have the blob in hand, e.g. right after
// generating a certificate that isn't persisted to disk (StandaloneCertificate).
// Loads it into a hidden 0x0 iframe and calls .print() on the iframe's own
// window once it's loaded, rather than window.print() on the host page,
// so the host page itself never enters print mode. Falls back to opening
// the PDF in a new tab (letting the browser's native PDF viewer offer its
// own print button) if .print() throws — some browsers refuse to drive
// window.print() from inside a cross-origin-ish iframe context, or block
// it entirely depending on PDF viewer plugin state.
//
// There's no reliable browser event for "the print dialog was closed" —
// afterprint doesn't fire consistently across browsers for iframe-hosted
// PDFs — so cleanup (removing the iframe, revoking the object URL) is
// simply deferred 60s, long enough for anyone to finish printing.
export function printObjectUrl(objectUrl: string): void {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.visibility = "hidden";

  function cleanup() {
    iframe.remove();
    URL.revokeObjectURL(objectUrl);
  }

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      window.open(objectUrl, "_blank");
    }
  };

  document.body.appendChild(iframe);
  iframe.src = objectUrl;
  setTimeout(cleanup, 60_000);
}

// Fetches a PDF and prints it — the fetch-then-print counterpart to
// downloadFile. Returns an error message on failure, or null on success
// (including once the print flow has been handed off to the browser;
// there's no way to know whether the user actually printed).
export async function printFile(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include", ...init });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "Print failed";
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    printObjectUrl(objectUrl);
    return null;
  } catch {
    return "Print failed";
  }
}

export async function printFileViaPost(url: string, body: unknown): Promise<string | null> {
  return printFile(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
