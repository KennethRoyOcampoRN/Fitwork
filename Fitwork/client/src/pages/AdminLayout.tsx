import { Outlet, useLocation, useNavigate } from "react-router-dom";
import FolderTabs from "../components/FolderTabs";

const ADMIN_TABS = [
  ["users", "Users"],
  ["companies", "Companies"],
  ["templates", "APE Templates"],
  ["import", "Import"],
  ["needs-label", "Needs Label"],
  ["archived", "Archived Employees"],
  ["reports", "Reports"],
  ["settings", "Settings"],
  ["audit", "Audit Log"],
  ["backup", "Backup"],
];

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // "settings" has its own nested routes (branding, etc. — see
  // AdminSettingsLayout), so match by prefix rather than exact path,
  // same as every other section here.
  const active = ADMIN_TABS.find(([key]) => location.pathname.startsWith(`/admin/${key}`))?.[0] || ADMIN_TABS[0][0];

  return (
    <div>
      <h1 className="text-lg font-semibold mb-3">Admin</h1>
      <div className="mb-4">
        <FolderTabs
          tabs={ADMIN_TABS.map(([key, label]) => ({ key, label }))}
          active={active}
          onChange={(key) => navigate(`/admin/${key}`)}
        />
      </div>
      <div className="bg-white border rounded-b-xl rounded-tr-xl p-4">
        <Outlet />
      </div>
    </div>
  );
}
