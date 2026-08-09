import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

export interface CompanyOption {
  id: string;
  name: string;
  isPrimary: boolean;
  isActive: boolean;
}

export function useCompanies(): CompanyOption[] {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  useEffect(() => { api.get<CompanyOption[]>("/companies").then(setCompanies).catch(() => {}); }, []);
  return companies;
}

// Every report scope selector shares this shape: Primary company only
// (default) / All non-primary companies combined / a specific company /
// All employees.
export type ScopeValue = { scope: "primary" | "all" | "nonPrimary" } | { scope: "company"; companyId: string };

export const DEFAULT_SCOPE: ScopeValue = { scope: "primary" };

export function scopeParams(value: ScopeValue): Record<string, string> {
  if (value.scope === "company") return { scope: "company", companyId: value.companyId };
  return { scope: value.scope };
}

export default function ScopeSelect({ value, onChange, companies }: { value: ScopeValue; onChange: (v: ScopeValue) => void; companies: CompanyOption[] }) {
  const selectValue = value.scope === "company" ? value.companyId : value.scope;
  return (
    <div>
      <label className="block text-xs font-medium mb-1">Scope</label>
      <select
        value={selectValue}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "primary" || v === "all" || v === "nonPrimary") onChange({ scope: v });
          else onChange({ scope: "company", companyId: v });
        }}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="primary">Primary company only</option>
        <option value="nonPrimary">All non-primary companies (combined)</option>
        <option value="all">All employees</option>
        {companies.filter((c) => c.isActive && !c.isPrimary).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}
