import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useBranding } from "../lib/branding";
import { IconClinicLogo, IconSearch, IconHome, IconListChecks, IconShield, IconChevronLeft, IconChevronRight, IconLogout, IconFileText, IconTag } from "./icons";

const COLLAPSE_BREAKPOINT_PX = 1024; // matches Tailwind's `lg` — small laptop widths and below
const COLLAPSE_STORAGE_KEY = "fitwork-sidebar-collapsed";

// Defaults to auto-collapsing on narrow viewports; a manual toggle pins the
// user's preference (persisted) until they toggle again.
function useSidebarCollapsed() {
  const [manual, setManual] = useState<boolean | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    return saved === null ? null : saved === "true";
  });
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < COLLAPSE_BREAKPOINT_PX);

  useEffect(() => {
    function onResize() { setNarrow(window.innerWidth < COLLAPSE_BREAKPOINT_PX); }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const collapsed = manual ?? narrow;
  function toggle() {
    const next = !collapsed;
    setManual(next);
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
  }
  return { collapsed, toggle };
}

// Persistent, second-resolution clock for staff charting reference (e.g.
// confirming an exact timestamp while writing a note). Lives in the sidebar
// footer; hidden when the sidebar is collapsed to icon-only (no room to
// read it usefully at that width).
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="bg-white/10 border border-white/10 rounded-md px-3 py-1.5 text-center" title="Current date and time">
      <div className="text-[10px] uppercase tracking-wide text-clinic-300">
        {now.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
      </div>
      <div className="text-lg font-mono font-bold tabular-nums text-white">
        {now.toLocaleTimeString(undefined, { hour12: true })}
      </div>
    </div>
  );
}

interface NavItemDef {
  key: string;
  label: string;
  to: string;
  end?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const branding = useBranding();
  const navigate = useNavigate();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [q, setQ] = useState("");

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  const navItems: NavItemDef[] = [
    { key: "dashboard", label: "Dashboard", to: "/", end: true, icon: IconHome },
    { key: "ledger", label: "Note Ledger", to: "/ledger", icon: IconListChecks },
  ];
  if (user?.role === "NURSE" || user?.role === "ADMIN") navItems.push({ key: "reports", label: "Reports", to: "/reports", icon: IconFileText });
  if (user?.role === "DOCTOR" || user?.role === "DENTIST") navItems.push({ key: "standalone-cert", label: "Standalone Certificate", to: "/certificates/standalone", icon: IconFileText });
  navItems.push({ key: "verify-cert", label: "Verify Certificate", to: "/certificates/verify", icon: IconTag });
  if (user?.role === "ADMIN") navItems.push({ key: "admin", label: "Admin", to: "/admin", icon: IconShield });

  // Solid accent fill for the active item (not just a border) — reads more
  // clearly as "current page" against the dark navy sidebar fill than a
  // subtle border would.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive
        ? "bg-clinic-600 text-white shadow-sm"
        : "text-clinic-100 hover:bg-white/10 hover:text-white"
    } ${collapsed ? "justify-center px-2" : ""}`;

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside
        className={`${collapsed ? "w-16" : "w-60"} shrink-0 bg-clinic-900 flex flex-col h-screen sticky top-0 transition-[width] duration-150`}
      >
        <div className={`flex items-center gap-2 h-20 border-b border-white/10 shrink-0 ${collapsed ? "justify-center px-2" : "px-4"}`}>
          {collapsed ? (
            // Collapsed = icon-only width — an arbitrary uploaded logo isn't
            // reliably croppable into a small icon, so this always falls
            // back to the default mark rather than distorting a custom logo.
            <IconClinicLogo className="w-8 h-8 shrink-0" />
          ) : branding.logoUrl ? (
            <div className="h-12 w-28 flex items-center justify-center shrink-0">
              <img src={branding.logoUrl} alt={`${branding.appName} logo`} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <IconClinicLogo className="w-8 h-8 shrink-0" />
          )}
          {!collapsed && <span className="font-semibold text-lg text-white tracking-wide truncate">{branding.appName}</span>}
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.key} to={item.to} end={item.end} className={navLinkClass} title={collapsed ? item.label : undefined}>
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className={`border-t border-white/10 shrink-0 space-y-2 ${collapsed ? "p-2" : "p-3"}`}>
          {!collapsed && <LiveClock />}
          {!collapsed && (
            <div className="text-sm text-clinic-100 truncate" title={`${user?.fullName} (${user?.role})`}>
              {user?.fullName} <span className="text-clinic-300">({user?.role})</span>
            </div>
          )}
          <button
            onClick={() => logout().then(() => navigate("/login"))}
            className="w-full bg-clinic-600 hover:bg-clinic-700 text-white rounded-md py-1.5 font-medium text-sm transition-colors flex items-center justify-center gap-2"
            title="Log out"
          >
            <IconLogout className="w-4 h-4" />
            {!collapsed && "Log out"}
          </button>
          <button
            onClick={toggle}
            className="w-full flex items-center justify-center gap-1 text-clinic-300 hover:text-white text-xs py-1"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <IconChevronRight className="w-4 h-4" /> : <><IconChevronLeft className="w-4 h-4" /> Collapse</>}
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="bg-white border-b border-gray-200 px-4 py-2.5">
          <form onSubmit={onSearchSubmit} className="max-w-md relative">
            <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="global-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search employee code or name... (press /)"
              className="w-full rounded-md pl-9 pr-3 py-1.5 text-gray-900 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-clinic-500 focus:border-clinic-500"
            />
          </form>
        </div>
        <main className="flex-1 p-4 max-w-6xl mx-auto w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
