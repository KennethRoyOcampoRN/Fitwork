import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  useEffect(() => {
    (async () => {
      setEmployees(await api.get<Employee[]>("/employees"));
      setLoading(false);
    })();
  }, []);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-2">All Employees</h1>
      <p className="text-sm text-gray-500 mb-4">
        Every active employee on file. ⚠ marks a known allergy or chronic condition — open the profile for details.
      </p>
      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Employee</th><th className="p-2">Code</th><th className="p-2">Department</th><th className="p-2">Company</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {!loading && employees.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No active employees.</td></tr>}
            {employees.map((e) => (
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
                <td className="p-2">{e.department || "—"}</td>
                <td className="p-2">{e.company?.name || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
