import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface FlaggedDoc {
  id: string;
  category: string;
  title: string;
  createdAt: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string };
  uploadedBy: { fullName: string };
}

async function downloadCsv() {
  const res = await fetch("/api/documents/needs-label/export.csv", { credentials: "include" });
  if (!res.ok) return;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "documents-needing-label.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminNeedsLabel() {
  const [docs, setDocs] = useState<FlaggedDoc[] | null>(null);

  useEffect(() => { api.get<FlaggedDoc[]>("/documents/needs-label").then(setDocs); }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <h1 className="text-lg font-semibold">Documents Needing a Label</h1>
        {docs && docs.length > 0 && (
          <button onClick={downloadCsv} className="bg-clinic-600 text-white rounded px-3 py-1.5 text-sm">Download CSV</button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Labs & Documents uploads whose Title had no exact-match sibling to auto-link to a category label (typos or
        one-off variations of a document title). Review each and assign the correct label from the employee's Labs &
        Documents tab.
      </p>
      {docs === null && <p className="text-sm text-gray-400">Loading...</p>}
      {docs && docs.length === 0 && <p className="text-sm text-gray-400">Nothing flagged — every document has a label.</p>}
      {docs && docs.length > 0 && (
        <div className="bg-white border rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="p-2">Employee</th><th className="p-2">Category</th><th className="p-2">Title</th>
                <th className="p-2">Uploaded By</th><th className="p-2">Uploaded</th><th className="p-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {docs.map((d) => (
                <tr key={d.id}>
                  <td className="p-2">{d.employee.lastName}, {d.employee.firstName} <span className="text-gray-400">#{d.employee.employeeCode}</span></td>
                  <td className="p-2">{d.category.replace(/_/g, " ")}</td>
                  <td className="p-2">{d.title}</td>
                  <td className="p-2">{d.uploadedBy.fullName}</td>
                  <td className="p-2">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="p-2">
                    <Link to={`/employees/${d.employee.id}?tab=documents&focus=${d.id}`} className="text-clinic-300 underline">Review</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
