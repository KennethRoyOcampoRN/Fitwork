import { NavLink, Outlet } from "react-router-dom";

// Nested one level under Admin so future settings sections (beyond
// Branding) have a home without crowding the top-level Admin tab bar.
export default function AdminSettingsLayout() {
  return (
    <div>
      <h2 className="text-base font-semibold mb-3">Settings</h2>
      <div className="flex gap-2 border-b mb-4 text-sm">
        {[
          ["branding", "Branding"],
        ].map(([key, label]) => (
          <NavLink
            key={key}
            to={`/admin/settings/${key}`}
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
