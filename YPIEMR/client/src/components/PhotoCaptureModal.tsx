import React, { useEffect, useRef, useState } from "react";

interface Props {
  // Existing-employee flow: uploads immediately to that employee's photo endpoint.
  employeeId?: string;
  onClose: () => void;
  onSaved?: () => void;
  // New-employee flow: no employeeId exists yet, so hand the captured blob
  // back to the caller instead of uploading — the caller uploads it once
  // the employee record (and its id) actually exists.
  onCapture?: (blob: Blob) => void;
}

type Tab = "upload" | "webcam";

// Converts a captured data: URL to a Blob without going through fetch() —
// the app's CSP (connect-src 'self') blocks fetch from resolving a data:
// URI, so this decodes the base64 payload directly instead.
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export default function PhotoCaptureModal({ employeeId, onClose, onSaved, onCapture }: Props) {
  const [tab, setTab] = useState<Tab>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (tab !== "webcam" || captured) return;
    if (!window.isSecureContext) {
      setCamError("Camera access requires a secure (HTTPS) connection. This page was loaded over an insecure connection.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError("This browser does not support camera capture.");
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (err.name === "NotFoundError") setCamError("No camera was found on this device.");
        else if (err.name === "NotAllowedError") setCamError("Camera permission was denied.");
        else setCamError(`Could not access camera: ${err.message}`);
      });

    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [tab, captured]);

  function capture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
    setCaptured(canvas.toDataURL("image/jpeg", 0.9));
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }

  function retake() {
    setCaptured(null);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function save() {
    setBusy(true);
    try {
      let blob: Blob | null = null;
      if (tab === "upload" && file) {
        blob = file;
      } else if (tab === "webcam" && captured) {
        blob = dataUrlToBlob(captured);
      } else {
        return;
      }

      if (onCapture) {
        onCapture(blob);
        onClose();
        return;
      }

      const form = new FormData();
      form.append("photo", blob, tab === "webcam" ? "capture.jpg" : (file?.name || "photo.jpg"));
      const res = await fetch(`/api/employees/${employeeId}/photo`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!res.ok) throw new Error((await res.json()).error || "Upload failed");
      onSaved?.();
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white form-panel rounded-lg p-4 w-full max-w-md">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">{onCapture ? "Add employee photo" : "Update employee photo"}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="flex gap-2 mb-3 text-sm">
          <button onClick={() => setTab("upload")} className={`px-3 py-1 rounded ${tab === "upload" ? "bg-clinic-600 text-white" : "bg-gray-100"}`}>Upload file</button>
          <button onClick={() => setTab("webcam")} className={`px-3 py-1 rounded ${tab === "webcam" ? "bg-clinic-600 text-white" : "bg-gray-100"}`}>Use webcam</button>
        </div>

        {tab === "upload" && (
          <div>
            <input type="file" accept="image/*" onChange={onFileChange} className="mb-3" />
            {preview && <img src={preview} className="w-40 h-40 object-cover rounded mx-auto" />}
          </div>
        )}

        {tab === "webcam" && (
          <div>
            {camError && <p className="text-sm text-red-600 mb-2">{camError}</p>}
            {!camError && !captured && (
              <div className="relative">
                <video ref={videoRef} autoPlay playsInline className="w-full rounded bg-black aspect-square object-cover" />
                <div className="absolute inset-6 border-2 border-dashed border-white/70 rounded-full pointer-events-none" />
              </div>
            )}
            {captured && <img src={captured} className="w-full rounded aspect-square object-cover" />}
            <canvas ref={canvasRef} className="hidden" />
            <div className="flex gap-2 mt-3">
              {!captured && !camError && (
                <button onClick={capture} className="flex-1 bg-clinic-600 text-white rounded py-2">Capture</button>
              )}
              {captured && (
                <button onClick={retake} className="flex-1 bg-gray-200 rounded py-2">Retake</button>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={save}
            disabled={busy || (tab === "upload" ? !file : !captured)}
            className="px-4 py-2 bg-clinic-600 text-white rounded text-sm disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save photo"}
          </button>
        </div>
      </div>
    </div>
  );
}
