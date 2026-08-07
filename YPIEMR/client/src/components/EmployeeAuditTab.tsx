import React, { useEffect, useState } from "react";
import { api } from "../lib/api";

interface AuditLog {
  id: string;
  action: string;
  entityType: string | null;
  createdAt: string;
  user: { username: string; fullName: string } | null;
}

export default function EmployeeAuditTab({ employeeId }: { employeeId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    api.get<AuditLog[]>(`/audit?employeeId=${employeeId}&limit=500`).then(setLogs);
  }, [employeeId]);

  return (
    <div className="bg-white border rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr><th className="p-2">Time</th><th className="p-2">User</th><th className="p-2">Action</th><th className="p-2">Entity</th></tr>
        </thead>
        <tbody className="divide-y">
          {logs.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No recorded access yet.</td></tr>}
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="p-2 whitespace-nowrap">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="p-2">{l.user ? l.user.fullName : "—"}</td>
              <td className="p-2">{l.action.replace(/_/g, " ")}</td>
              <td className="p-2">{l.entityType || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
