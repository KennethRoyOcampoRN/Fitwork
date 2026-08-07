import React, { useEffect, useState } from "react";

export default function EditCountdown({ editableUntil }: { editableUntil: string }) {
  const [remaining, setRemaining] = useState(() => new Date(editableUntil).getTime() - Date.now());

  useEffect(() => {
    const t = setInterval(() => setRemaining(new Date(editableUntil).getTime() - Date.now()), 1000);
    return () => clearInterval(t);
  }, [editableUntil]);

  if (remaining <= 0) return null;

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
      Editable for {minutes}:{seconds.toString().padStart(2, "0")}
    </span>
  );
}
