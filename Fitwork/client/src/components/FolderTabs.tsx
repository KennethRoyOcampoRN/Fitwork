import React from "react";

// Folder/sheet-tab style tab strip — shared by Reports (category + report
// sub-tabs), AdminLayout (section tabs), and EmployeeProfile (record-type
// tabs), so all three stay visually and behaviorally identical rather than
// drifting via separate copies. Deliberately not a flex-1/equal-width or
// truncating layout — each tab is sized to its own label (plain inline
// button sizing) and the strip just wraps onto additional rows via
// flex-wrap when it runs out of horizontal space, rather than shrinking,
// squishing, or scrolling. `size` swaps a couple of classes for a
// slightly smaller/lighter row (e.g. Reports' sub-tabs) so nested tab
// levels stay visually distinguishable at a glance.
export default function FolderTabs({ tabs, active, onChange, size = "lg" }: {
  tabs: { key: string; label: string }[]; active: string; onChange: (key: string) => void; size?: "lg" | "sm";
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`rounded-t-lg font-medium whitespace-nowrap transition-colors ${
            size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
          } ${
            active === t.key
              ? "bg-clinic-600 shadow-sm"
              : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
