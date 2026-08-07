import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { NOTE_TYPE_LABEL } from "../lib/noteTypes";
import {
  IconSearch, IconStethoscope, IconHeartPulse, IconTooth, IconListChecks, IconShield, IconUserPlus, IconUsers,
} from "../components/icons";

interface DashboardCardDef {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  to: string;
}

interface EmployeeListItem {
  id: string;
  createdAt: string;
}

interface LedgerNoteItem {
  id: string;
  noteType: string;
  visitDateTime: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
}

interface StatCardDef {
  key: string;
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}

function startOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="w-9 h-9 rounded-lg bg-clinic-50 brand-chip text-clinic-400 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-3xl font-bold text-white leading-none">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<{ activeEmployees: number; notesThisMonth: number; newEmployeesThisMonth: number } | null>(null);
  const [recentNotes, setRecentNotes] = useState<LedgerNoteItem[] | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    // The ledger list (most recent 500, desc) doubles as both the "notes
    // this month" count and the recent-activity feed below, rather than
    // making two separate requests for overlapping data.
    Promise.all([
      api.get<EmployeeListItem[]>("/employees"),
      api.get<LedgerNoteItem[]>("/notes/ledger/list"),
    ]).then(([employees, notes]) => {
      const monthStart = startOfMonth();
      setStats({
        activeEmployees: employees.length,
        notesThisMonth: notes.filter((n) => new Date(n.visitDateTime) >= monthStart).length,
        newEmployeesThisMonth: employees.filter((e) => new Date(e.createdAt) >= monthStart).length,
      });
      setRecentNotes(notes.slice(0, 6));
    });
  }, []);

  const cards: DashboardCardDef[] = [
    { key: "search", label: "Find an Employee", description: "Search by code, name, or department", icon: IconSearch, to: "/search" },
    { key: "all-employees", label: "View All Employees", description: "Browse every active employee record", icon: IconUsers, to: "/employees/all" },
    { key: "doctor", label: "Doctor's Notes", description: "Browse doctor's notes across all employees", icon: IconStethoscope, to: "/ledger?noteType=DOCTOR" },
    { key: "nurse", label: "Nurse's Notes", description: "Browse nurse's notes across all employees", icon: IconHeartPulse, to: "/ledger?noteType=NURSE" },
    { key: "dentist", label: "Dentist's Notes", description: "Browse dental notes across all employees", icon: IconTooth, to: "/ledger?noteType=DENTIST" },
    { key: "ledger", label: "Note Ledger", description: "All clinical notes across every employee", icon: IconListChecks, to: "/ledger" },
  ];

  // Creating employee records is restricted to NURSE/ADMIN (doctors/dentists
  // are contracted clinicians, not employees, per the role-permission update).
  if (user?.role === "NURSE" || user?.role === "ADMIN") {
    cards.push({ key: "new-employee", label: "New Employee", description: "Add a new employee record", icon: IconUserPlus, to: "/employees/new" });
  }

  if (user?.role === "ADMIN") {
    cards.push({ key: "admin", label: "Admin", description: "Users, templates, imports, audit & backup", icon: IconShield, to: "/admin" });
  }

  // A clinician's own note type is the one they can actually write — surface
  // it as a subtle highlight rather than hiding the (read-only) others.
  const ownNoteTypeKey = user?.role === "DOCTOR" ? "doctor" : user?.role === "NURSE" ? "nurse" : user?.role === "DENTIST" ? "dentist" : null;

  const statCards: StatCardDef[] = stats ? [
    { key: "employees", label: "Active Employees", value: stats.activeEmployees, icon: IconUsers },
    { key: "notes", label: "Notes This Month", value: stats.notesThisMonth, icon: IconListChecks },
    { key: "new-employees", label: "New Employees This Month", value: stats.newEmployeesThisMonth, icon: IconUserPlus },
  ] : [];

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-1">Welcome, {user?.fullName}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Type an employee code or name in the search bar above, or press <kbd className="border rounded px-1.5 py-0.5 bg-white text-xs">/</kbd> to jump there.
      </p>

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          {statCards.map((s) => <StatCard key={s.key} icon={s.icon} label={s.label} value={s.value} />)}
        </div>
      )}

      <div className="bg-white border rounded-xl p-4 mb-6">
        <h2 className="font-medium mb-3">Recent Activity</h2>
        {recentNotes === null && <p className="text-sm text-gray-400">Loading...</p>}
        {recentNotes && recentNotes.length === 0 && <p className="text-sm text-gray-400">No recent clinical notes yet.</p>}
        {recentNotes && recentNotes.length > 0 && (
          <ul className="divide-y">
            {recentNotes.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => navigate(`/employees/${n.employee.id}?tab=${n.noteType.toLowerCase()}`)}
                  className="w-full py-2.5 flex items-center justify-between gap-3 text-left hover:bg-white/10 rounded px-1 -mx-1 transition-colors"
                >
                  <span className="text-sm truncate">
                    {NOTE_TYPE_LABEL[n.noteType] || n.noteType} — {n.employee.lastName}, {n.employee.firstName}
                    <span className="text-gray-400"> #{n.employee.employeeCode}</span>
                  </span>
                  <span className="text-xs text-gray-500 shrink-0">
                    {new Date(n.visitDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    {" · "}
                    {new Date(n.visitDateTime).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="font-medium text-white mb-3">Quick Links</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          const isOwn = card.key === ownNoteTypeKey;
          return (
            <button
              key={card.key}
              onClick={() => navigate(card.to)}
              className={`group bg-white border rounded-xl p-4 text-left transition-all hover:shadow-md hover:border-clinic-300 ${
                isOwn ? "border-clinic-300 ring-1 ring-clinic-100" : "border-gray-200"
              }`}
            >
              <div className="w-11 h-11 rounded-lg bg-clinic-50 brand-chip brand-chip-hover text-clinic-400 flex items-center justify-center mb-3 transition-colors">
                <Icon className="w-6 h-6" />
              </div>
              <div className="font-semibold text-white">{card.label}</div>
              <div className="text-sm text-gray-500 mt-0.5">{card.description}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
