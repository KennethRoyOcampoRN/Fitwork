import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
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

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

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

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white mb-1">Welcome, {user?.fullName}</h1>
      <p className="text-sm text-gray-500 mb-6">
        Type an employee code or name in the search bar above, or press <kbd className="border rounded px-1.5 py-0.5 bg-white text-xs">/</kbd> to jump there.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          const isOwn = card.key === ownNoteTypeKey;
          return (
            <button
              key={card.key}
              onClick={() => navigate(card.to)}
              className={`group bg-white border rounded-xl p-5 text-left transition-all hover:shadow-md hover:border-clinic-300 ${
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
