import React from "react";

interface Props {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
}

// Reusable vitals/metric tile — solid theme-accent fill with white text/icon,
// so key numbers read boldly at a glance instead of sitting in a pale card.
// Colors are the `clinic-*` Tailwind classes, which resolve through the
// admin-customizable --clinic-primary/--clinic-accent CSS variables (see
// tailwind.config.js / index.css), so a branding color change re-themes
// every tile instantly with no rebuild and no hardcoded hex here.
export default function StatTile({ icon: Icon, label, value, sublabel }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-clinic-600 text-white p-3.5 min-w-0 shadow-sm">
      <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
        <Icon className="w-6 h-6" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-white/80 truncate">{label}</div>
        <div className="text-xl font-bold leading-tight truncate">{value}</div>
        {sublabel && <div className="text-[11px] text-white/85 truncate">{sublabel}</div>}
      </div>
    </div>
  );
}
