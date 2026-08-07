import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";

interface SearchResult {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  photoThumbPath: string | null;
  lastVisit: string | null;
}

export default function EmployeeSearch() {
  const { user } = useAuth();
  const canCreate = user?.role === "NURSE" || user?.role === "ADMIN";
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [results, setResults] = useState<SearchResult[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!q) return;
    api.get<{ exactMatch: string | null; results: SearchResult[] }>(`/employees/search?q=${encodeURIComponent(q)}`)
      .then((data) => {
        if (data.exactMatch && data.results.length === 1) {
          navigate(`/employees/${data.exactMatch}`, { replace: true });
        } else {
          setResults(data.results);
        }
      });
  }, [q]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-lg font-semibold">Search results for "{q}"</h1>
        {canCreate && (
          <button
            onClick={() => navigate(`/employees/new${q ? `?code=${encodeURIComponent(q)}` : ""}`)}
            className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm"
          >
            + New employee
          </button>
        )}
      </div>
      <div className="bg-white border rounded-xl divide-y">
        {results.length === 0 && (
          <div className="p-4 text-sm text-gray-500">
            No matches found. {q && <>No employee with code or name matching "{q}" exists yet.{" "}</>}
            {canCreate && (
              <button onClick={() => navigate(`/employees/new${q ? `?code=${encodeURIComponent(q)}` : ""}`)} className="text-clinic-300 underline">
                Create a new employee record
              </button>
            )}
          </div>
        )}
        {results.map((r) => (
          <button
            key={r.id}
            onClick={() => navigate(`/employees/${r.id}`)}
            className="w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50"
          >
            <div className="w-10 h-10 rounded-full bg-gray-200 overflow-hidden flex items-center justify-center text-xs text-gray-500">
              {r.photoThumbPath ? <img src={`/api/employees/${r.id}/photo/thumb`} className="w-full h-full object-cover" /> : "N/A"}
            </div>
            <div className="flex-1">
              <div className="font-medium">{r.lastName}, {r.firstName} <span className="text-gray-400 font-normal">({r.employeeCode})</span></div>
              <div className="text-xs text-gray-500">{r.department || "—"}</div>
            </div>
            <div className="text-xs text-gray-400">
              {r.lastVisit ? `Last visit ${new Date(r.lastVisit).toLocaleDateString()}` : "No visits yet"}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
