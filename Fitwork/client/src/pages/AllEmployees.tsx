import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string | null;
  company: { id: string; name: string } | null;
  knownAllergies: string | null;
  chronicConditions: string | null;
}

export default function AllEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const noDepartmentFilter = searchParams.get("filter") === "no-department";

  useEffect(() => {
    (async () => {
      setEmployees(await api.get<Employee[]>("/employees"));
      setLoading(false);
    })();
  }, []);

  const visible = noDepartmentFilter ? employees.filter((e) => !e.department) : employees;

  return (
    <div>
      <h1 className="text-lg font-semibold mb-2">All Employees</h1>
      <p className="text-sm text-gray-500 mb-4">
        Every active employee on file. ⚠ marks a known allergy or chronic condition — open the profile for details.
      </p>

      {noDepartmentFilter ? (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-800">
          <span>Showing {visible.length} employee{visible.length === 1 ? "" : "s"} with no department set — open a record and click Edit to add one.</span>
          <button onClick={() => setSearchParams({})} className="underline shrink-0">Clear filter</button>
        </div>
      ) : (
        !loading && employees.some((e) => !e.department) && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-800">
            <span>⚠ {employees.filter((e) => !e.department).length} employee{employees.filter((e) => !e.department).length === 1 ? "" : "s"} below {employees.filter((e) => !e.department).length === 1 ? "has" : "have"} no department set.</span>
            <button onClick={() => setSearchParams({ filter: "no-department" })} className="underline shrink-0">Show only those</button>
          </div>
        )
      )}

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Employee</th><th className="p-2">Code</th><th className="p-2">Department</th><th className="p-2">Company</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && visible.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-gray-400">{noDepartmentFilter ? "No employees are missing a department." : "No active employees."}</td></tr>
            )}
            {visible.map((e) => (
              <tr key={e.id}>
                <td className="p-2">
                  <Link to={`/employees/${e.id}`} className="text-clinic-300 underline">
                    {e.lastName}, {e.firstName}
                  </Link>
                  {(e.knownAllergies || e.chronicConditions) && (
                    <span
                      className="ml-2 text-amber-600"
                      title={[e.knownAllergies && `Allergies: ${e.knownAllergies}`, e.chronicConditions && `Chronic: ${e.chronicConditions}`].filter(Boolean).join(" · ")}
                    >
                      ⚠
                    </span>
                  )}
                </td>
                <td className="p-2">{e.employeeCode}</td>
                <td className="p-2">
                  {e.department || <span className="text-amber-700" title="No department set — this employee is excluded from department-scoped reports until it's added.">⚠ Not set</span>}
                </td>
                <td className="p-2">{e.company?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
