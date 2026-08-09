import { NavLink, Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">Admin</h1>
      <div className="flex gap-2 border-b mb-4 text-sm">
        {[
          ["users", "Users"],
          ["companies", "Companies"],
          ["test-types", "Test Types"],
          ["templates", "APE Templates"],
          ["import", "Import"],
          ["archived", "Archived Employees"],
          ["reports", "Reports"],
          ["settings", "Settings"],
          ["audit", "Audit Log"],
          ["backup", "Backup"],
        ].map(([key, label]) => (
          <NavLink
            key={key}
            to={`/admin/${key}`}
            className={({ isActive }) => `px-3 py-2 ${isActive ? "border-b-2 border-clinic-600 font-medium" : "text-gray-500"}`}
          >
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
