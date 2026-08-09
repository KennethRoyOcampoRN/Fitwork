import React, { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import PhotoCaptureModal from "../components/PhotoCaptureModal";
import NotesTab from "../components/NotesTab";
import DentalChart from "../components/DentalChart";
import DocumentsTab from "../components/DocumentsTab";
import MedicationsTab from "../components/MedicationsTab";
import ApeTab from "../components/ApeTab";
import DrugTestTab from "../components/DrugTestTab";
import CertificateTab from "../components/CertificateTab";
import PreEmploymentTab from "../components/PreEmploymentTab";
import LabTestTab from "../components/LabTestTab";
import LineChart from "../components/LineChart";
import EmployeeAuditTab from "../components/EmployeeAuditTab";
import StatTile from "../components/StatTile";
import PermanentDeleteButton from "../components/PermanentDeleteButton";
import EmployeeExportModal from "../components/EmployeeExportModal";
import { IconHeartPulse, IconGauge, IconDroplet, IconRuler, IconCalendar, IconUser, IconBuilding, IconBriefcase, IconTag, IconDownload, IconEdit, IconArchiveBox, IconTrash } from "../components/icons";
import { useAuth } from "../lib/auth";

interface VitalsRecord {
  id: string;
  recordedAt: string;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bmiCategory: string | null;
  systolic: number | null;
  diastolic: number | null;
}

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  dateOfBirth: string | null;
  sex: string | null;
  religion: string | null;
  company: { id: string; name: string } | null;
  department: string | null;
  position: string | null;
  address: string | null;
  bloodType: string | null;
  knownAllergies: string | null;
  chronicConditions: string | null;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactNumber: string | null;
  photoPath: string | null;
  isActive: boolean;
  latestVitals: VitalsRecord | null;
}

interface TimelineItem {
  type: string;
  date: string;
  label: string;
  id: string;
  tab: string;
}

const BMI_COLORS: Record<string, string> = {
  UNDERWEIGHT: "bg-blue-100 text-blue-800",
  NORMAL: "bg-green-100 text-green-800",
  OVERWEIGHT: "bg-yellow-100 text-yellow-800",
  OBESE_I: "bg-orange-100 text-orange-800",
  OBESE_II: "bg-red-100 text-red-800",
};

function age(dob: string | null): string {
  if (!dob) return "—";
  const d = new Date(dob);
  const diff = Date.now() - d.getTime();
  return `${Math.floor(diff / (365.25 * 24 * 3600 * 1000))} yrs`;
}

// One scannable icon+label+value row for the identity panel's summary
// block — stacked instead of run together as one dense inline sentence.
function SummaryRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm min-w-0">
      <Icon className="w-4 h-4 text-clinic-500 shrink-0" />
      <span className="text-gray-400 shrink-0">{label}:</span>
      <span className="font-medium text-gray-700 truncate">{value}</span>
    </div>
  );
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const tab = searchParams.get("tab") || "overview";
  const focusId = searchParams.get("focus");

  async function load() {
    if (!id) return;
    const emp = await api.get<Employee>(`/employees/${id}`);
    setEmployee(emp);
    const ov = await api.get<{ timeline: TimelineItem[] }>(`/employees/${id}/overview`);
    setTimeline(ov.timeline);
  }

  useEffect(() => { load(); }, [id]);

  if (!employee) return <div className="p-4 text-sm text-gray-500">Loading...</div>;

  const v = employee.latestVitals;
  // Employee demographic/photo edits (and archive/restore) are restricted to
  // NURSE and ADMIN — doctors and dentists (contracted/visiting clinicians)
  // can still view everything (C7) but not create or edit employee records.
  const canEditEmployee = user?.role === "NURSE" || user?.role === "ADMIN";

  function goToTab(key: string) {
    setSearchParams({ tab: key });
  }

  async function archive() {
    if (!employee) return;
    const reason = prompt(`Reason for archiving ${employee.lastName}, ${employee.firstName}'s record (optional):`) ?? undefined;
    setArchiveBusy(true);
    try {
      await api.post(`/employees/${employee.id}/archive`, { reason: reason || undefined });
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not archive employee");
    } finally {
      setArchiveBusy(false);
    }
  }

  async function restore() {
    if (!employee) return;
    setArchiveBusy(true);
    try {
      await api.post(`/employees/${employee.id}/restore`, {});
      await load();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not restore employee");
    } finally {
      setArchiveBusy(false);
    }
  }

  // Permanent delete is for correcting genuine mistakes (duplicate/wrongly
  // created records) only — reserved for ADMIN, and the server independently
  // re-validates both the confirmation text and that no clinical history
  // exists, so this client-side prompt is convenience, not the real guard.
  async function deletePermanently() {
    if (!employee) return;
    const confirmText = prompt(
      `This permanently deletes ${employee.lastName}, ${employee.firstName} (#${employee.employeeCode}) and cannot be undone.\n\n` +
      `This only works if the record has no clinical notes, medications, documents, vitals, or APE records attached — otherwise archive it instead.\n\n` +
      `Type the employee code or full name to confirm:`
    );
    if (!confirmText) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/employees/${employee.id}`, { confirmText });
      navigate("/search", { replace: true });
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "Could not delete employee");
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div>
      {!employee.isActive && (
        <div className="bg-gray-700 text-white rounded px-4 py-2 mb-3 text-sm flex items-center justify-between">
          <span>This employee record is archived — hidden from search and default lists.</span>
          {canEditEmployee && (
            <button onClick={restore} disabled={archiveBusy} className="underline text-sm disabled:opacity-50">
              {archiveBusy ? "Restoring..." : "Restore"}
            </button>
          )}
        </div>
      )}

      {employee.knownAllergies && (
        <div className="bg-red-600 text-white rounded px-4 py-2 mb-3 font-medium text-sm">
          ⚠ Known allergies: {employee.knownAllergies}
        </div>
      )}

      {employee.chronicConditions && (
        <div className="bg-amber-500 text-white rounded px-4 py-2 mb-3 font-medium text-sm">
          ⚠ Chronic conditions: {employee.chronicConditions}
        </div>
      )}

      {/* Identity panel: photo + name/code on the left, demographic summary
          and quick-stat tiles filling the rest, actions on the far right. */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="flex items-center gap-3 sm:flex-col sm:items-start sm:w-36 shrink-0">
            {canEditEmployee ? (
              <button onClick={() => setShowPhotoModal(true)} className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-clinic-100 brand-chip overflow-hidden flex items-center justify-center shrink-0">
                {employee.photoPath ? <img src={`/api/employees/${employee.id}/photo/full`} className="w-full h-full object-cover" /> : <IconUser className="w-10 h-10 sm:w-12 sm:h-12 text-clinic-400" />}
              </button>
            ) : (
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-clinic-100 brand-chip overflow-hidden flex items-center justify-center shrink-0">
                {employee.photoPath ? <img src={`/api/employees/${employee.id}/photo/full`} className="w-full h-full object-cover" /> : <IconUser className="w-10 h-10 sm:w-12 sm:h-12 text-clinic-400" />}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-white leading-tight">{employee.lastName}, {employee.firstName}</h1>
              {employee.middleName && <div className="text-sm text-gray-500">{employee.middleName}</div>}
              <div className="text-gray-400 text-sm">#{employee.employeeCode}</div>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 mb-4">
              <SummaryRow icon={IconCalendar} label="Age" value={age(employee.dateOfBirth)} />
              <SummaryRow icon={IconUser} label="Sex" value={employee.sex || "—"} />
              <SummaryRow icon={IconRuler} label="Height/Weight" value={`${v?.heightCm ?? "—"}cm / ${v?.weightKg ?? "—"}kg`} />
              <SummaryRow
                icon={IconBuilding}
                label="Dept"
                value={employee.department || (
                  <span className="text-amber-700" title="No department set — this employee is excluded from department-scoped reports until it's added.">
                    ⚠ Not set
                  </span>
                )}
              />
              <SummaryRow icon={IconBriefcase} label="Position" value={employee.position || "—"} />
              <SummaryRow icon={IconBuilding} label="Company" value={employee.company?.name || "—"} />
              <SummaryRow icon={IconTag} label="Religion" value={employee.religion || "—"} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <StatTile
                icon={IconHeartPulse}
                label="Blood Pressure"
                value={v?.systolic ? `${v.systolic}/${v.diastolic}` : "—"}
              />
              <StatTile
                icon={IconGauge}
                label="BMI"
                value={v?.bmi ?? "—"}
                sublabel={v?.bmiCategory ? (
                  <span className={`inline-block px-1.5 py-0.5 rounded-full ${BMI_COLORS[v.bmiCategory] || "bg-gray-100"}`}>
                    {v.bmiCategory.replace("_", " ")}
                  </span>
                ) : undefined}
              />
              <StatTile icon={IconDroplet} label="Blood Type" value={employee.bloodType || "—"} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 sm:justify-end sm:max-w-[16rem]">
            <button
              onClick={() => setShowExportModal(true)}
              className="inline-flex items-center gap-1.5 bg-clinic-600 hover:bg-clinic-700 text-white rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >
              <IconDownload className="w-3.5 h-3.5" /> Export
            </button>
            {canEditEmployee && (
              <button
                onClick={() => navigate(`/employees/${employee.id}/edit`)}
                className="inline-flex items-center gap-1.5 border border-clinic-300 text-clinic-300 hover:bg-white/10 hover:text-white rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              >
                <IconEdit className="w-3.5 h-3.5" /> Edit
              </button>
            )}
            {canEditEmployee && employee.isActive && (
              <button
                onClick={archive}
                disabled={archiveBusy}
                className="inline-flex items-center gap-1.5 border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
              >
                <IconArchiveBox className="w-3.5 h-3.5" /> {archiveBusy ? "Archiving..." : "Archive"}
              </button>
            )}
            {canEditEmployee && user?.role === "ADMIN" && (
              <>
                {/* A visual gap from the reversible actions above — this one
                    is permanent, so it shouldn't sit close enough to invite
                    an accidental click. */}
                <div className="w-px self-stretch bg-gray-200" />
                <button
                  onClick={deletePermanently}
                  disabled={deleteBusy}
                  className="inline-flex items-center gap-1.5 border border-red-300 text-red-700 hover:bg-red-50 rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <IconTrash className="w-3.5 h-3.5" /> {deleteBusy ? "Deleting..." : "Delete permanently"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grouped tab bar: related record types cluster together, separated
          by a thin divider (the same divider style used for the destructive
          action above), rather than one long strip. Wraps onto additional
          rows as tabs are added instead of scrolling — a wrapped divider
          just falls to whichever row it lands on, which reads fine in
          practice. Active state mirrors the sidebar's active nav item
          (solid clinic-600 fill) so "selected" is unambiguous at a glance. */}
      <div className="bg-white border rounded-xl p-2 mb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            [["overview", "Overview"]],
            [["doctor", "Doctor's Notes"], ["nurse", "Nurse's Notes"], ["dentist", "Dental"]],
            [["medications", "Medications"], ["documents", "Labs & Documents"], ["vitals", "Vitals"]],
            [["ape", "Annual Physical Exams"], ["drugtest", "Drug Test"], ["labtest", "Lab Tests"], ["preemployment", "Pre-Employment"], ["certificates", "Medical Certificates"]],
            ...(user?.role === "ADMIN" ? [[["audit", "Audit"]]] : []),
          ].map((group, i) => (
            <React.Fragment key={i}>
              {i > 0 && <div className="w-px self-stretch bg-gray-200 mx-1" />}
              {group.map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => goToTab(key)}
                  className={`px-3.5 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    tab === key ? "bg-clinic-600 text-white shadow-sm" : "text-gray-600 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-white border rounded-xl p-4">
            <h2 className="font-medium mb-2">Emergency contact</h2>
            <p className="text-sm text-gray-600">
              {employee.emergencyContactName || "—"} ({employee.emergencyContactRelation || "—"})<br />
              {employee.emergencyContactNumber || "—"}
            </p>
            <h2 className="font-medium mt-4 mb-2">Chronic conditions</h2>
            <p className="text-sm text-gray-600">{employee.chronicConditions || "None recorded"}</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <h2 className="font-medium mb-2">Recent activity</h2>
            <ul className="text-sm divide-y">
              {timeline.length === 0 && <li className="py-2 text-gray-400">No recorded events yet.</li>}
              {timeline.map((t) => (
                <li key={`${t.type}-${t.id}`}>
                  <button
                    onClick={() => setSearchParams({ tab: t.tab, focus: t.id })}
                    className="w-full py-2 flex justify-between items-start gap-3 text-left hover:bg-gray-50 rounded px-1 -mx-1"
                  >
                    <span>{t.label}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap shrink-0">{new Date(t.date).toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {tab === "vitals" && <VitalsTab employeeId={employee.id} onRecorded={load} />}
      {tab === "dentist" && <DentalChart employeeId={employee.id} />}
      {(tab === "doctor" || tab === "nurse" || tab === "dentist") && (
        <NotesTab employeeId={employee.id} noteType={tab.toUpperCase()} focusId={focusId} />
      )}
      {tab === "medications" && <MedicationsTab employeeId={employee.id} focusId={focusId} />}
      {tab === "documents" && <DocumentsTab employeeId={employee.id} focusId={focusId} />}
      {tab === "ape" && <ApeTab employeeId={employee.id} focusId={focusId} />}
      {tab === "drugtest" && <DrugTestTab employeeId={employee.id} focusId={focusId} />}
      {tab === "labtest" && <LabTestTab employeeId={employee.id} focusId={focusId} />}
      {tab === "preemployment" && <PreEmploymentTab employeeId={employee.id} focusId={focusId} />}
      {tab === "certificates" && (
        <CertificateTab
          employeeId={employee.id}
          employeeName={`${employee.firstName} ${employee.lastName}`.trim()}
          employeeAddress={employee.address || ""}
          focusId={focusId}
        />
      )}
      {tab === "audit" && user?.role === "ADMIN" && <EmployeeAuditTab employeeId={employee.id} />}

      {showPhotoModal && (
        <PhotoCaptureModal
          employeeId={employee.id}
          onClose={() => setShowPhotoModal(false)}
          onSaved={load}
        />
      )}

      {showExportModal && (
        <EmployeeExportModal
          employeeId={employee.id}
          employeeCode={employee.employeeCode}
          onClose={() => setShowExportModal(false)}
        />
      )}
    </div>
  );
}

interface ApeSummary {
  id: string;
  examYear: number;
  examDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bloodPressure: string | null;
}

function parseBloodPressure(bp: string | null): { systolic: number | null; diastolic: number | null } {
  if (!bp) return { systolic: null, diastolic: null };
  const parts = bp.split("/");
  const systolic = Number(parts[0]);
  const diastolic = Number(parts[1]);
  return {
    systolic: Number.isFinite(systolic) ? systolic : null,
    diastolic: Number.isFinite(diastolic) ? diastolic : null,
  };
}

function VitalsTab({ employeeId, onRecorded }: { employeeId: string; onRecorded: () => void }) {
  const { user } = useAuth();
  const [records, setRecords] = useState<VitalsRecord[]>([]);
  const [apes, setApes] = useState<ApeSummary[]>([]);
  const [form, setForm] = useState({ heightCm: "", weightKg: "", systolic: "", diastolic: "", pulseRate: "" });
  const [busy, setBusy] = useState(false);

  async function load() {
    const [v, a] = await Promise.all([
      api.get<VitalsRecord[]>(`/vitals/employee/${employeeId}`),
      api.get<ApeSummary[]>(`/ape?employeeId=${employeeId}`),
    ]);
    setRecords(v);
    setApes(a);
  }
  useEffect(() => { load(); }, [employeeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/vitals", {
        employeeId,
        heightCm: form.heightCm ? Number(form.heightCm) : undefined,
        weightKg: form.weightKg ? Number(form.weightKg) : undefined,
        systolic: form.systolic ? Number(form.systolic) : undefined,
        diastolic: form.diastolic ? Number(form.diastolic) : undefined,
        pulseRate: form.pulseRate ? Number(form.pulseRate) : undefined,
      });
      setForm({ heightCm: "", weightKg: "", systolic: "", diastolic: "", pulseRate: "" });
      await load();
      onRecorded();
    } finally {
      setBusy(false);
    }
  }

  // Merge routine vitals check-ins with Annual Physical Exam readings into a
  // single chronological trend per metric — the same physical measurement,
  // just recorded through two different workflows — so the chart reflects
  // the employee's full health history, not only what was entered here.
  const combined = [
    ...records.map((r) => ({ date: new Date(r.recordedAt).getTime(), heightCm: r.heightCm, weightKg: r.weightKg, bmi: r.bmi, ...{ systolic: r.systolic, diastolic: r.diastolic } })),
    ...apes.map((a) => {
      const { systolic, diastolic } = parseBloodPressure(a.bloodPressure);
      return { date: (a.examDate ? new Date(a.examDate) : new Date(a.examYear, 0, 1)).getTime(), heightCm: a.heightCm, weightKg: a.weightKg, bmi: a.bmi, systolic, diastolic };
    }),
  ].sort((a, b) => a.date - b.date);
  const latest = combined.length ? combined[combined.length - 1] : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatTile icon={IconRuler} label="Height" value={latest?.heightCm ? `${latest.heightCm} cm` : "—"} />
        <StatTile icon={IconGauge} label="Weight / BMI" value={latest?.weightKg ? `${latest.weightKg} kg` : "—"} sublabel={latest?.bmi ? `BMI ${latest.bmi}` : undefined} />
        <StatTile icon={IconHeartPulse} label="Blood Pressure" value={latest?.systolic ? `${latest.systolic}/${latest.diastolic}` : "—"} />
        <StatTile icon={IconDroplet} label="Readings on file" value={combined.length} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <form onSubmit={submit} className="bg-white border rounded-xl p-4 space-y-2 md:col-span-1">
        <h2 className="font-medium mb-2">Record vitals</h2>
        {(["heightCm", "weightKg", "systolic", "diastolic", "pulseRate"] as const).map((f) => (
          <input
            key={f}
            placeholder={f}
            type="number"
            value={form[f]}
            onChange={(e) => setForm({ ...form, [f]: e.target.value })}
            className="w-full border rounded px-2 py-1 text-sm"
          />
        ))}
        <p className="text-xs text-gray-400">BMI is computed automatically by the server.</p>
        <button disabled={busy} className="w-full bg-clinic-600 text-white rounded py-1.5 text-sm disabled:opacity-50">
          {busy ? "Saving..." : "Save"}
        </button>
      </form>
      <div className="md:col-span-2 space-y-4">
      <div className="bg-white border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <p className="text-xs text-gray-400 sm:col-span-2 -mb-2">Combines routine vitals check-ins with Annual Physical Exam readings.</p>
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">Height (cm)</h3>
          <LineChart
            yLabel="cm"
            series={[{ label: "Height", color: "#7c3aed", points: combined.map((r) => ({ x: r.date, y: r.heightCm })) }]}
          />
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">Weight (kg)</h3>
          <LineChart
            yLabel="kg"
            series={[{ label: "Weight", color: "#2563eb", points: combined.map((r) => ({ x: r.date, y: r.weightKg })) }]}
          />
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">BMI</h3>
          <LineChart
            yLabel="BMI"
            series={[{ label: "BMI", color: "#16a34a", points: combined.map((r) => ({ x: r.date, y: r.bmi })) }]}
          />
        </div>
        <div>
          <h3 className="text-xs font-medium text-gray-500 mb-1">Blood pressure (mmHg)</h3>
          <LineChart
            yLabel="mmHg"
            series={[
              { label: "Systolic", color: "#dc2626", points: combined.map((r) => ({ x: r.date, y: r.systolic })) },
              { label: "Diastolic", color: "#f59e0b", points: combined.map((r) => ({ x: r.date, y: r.diastolic })) },
            ]}
          />
        </div>
      </div>
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="p-2">Date</th><th className="p-2">Ht/Wt</th><th className="p-2">BMI</th><th className="p-2">BP</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r) => (
              <tr key={r.id}>
                <td className="p-2">{new Date(r.recordedAt).toLocaleDateString()}</td>
                <td className="p-2">{r.heightCm ?? "—"}cm / {r.weightKg ?? "—"}kg</td>
                <td className="p-2">{r.bmi ?? "—"} {r.bmiCategory && <span className={`text-xs px-1.5 py-0.5 rounded ${BMI_COLORS[r.bmiCategory]}`}>{r.bmiCategory.replace("_", " ")}</span>}</td>
                <td className="p-2">{r.systolic ?? "—"}/{r.diastolic ?? "—"}</td>
                <td className="p-2">
                  {user?.role === "ADMIN" && (
                    <PermanentDeleteButton
                      description={`Vitals record from ${new Date(r.recordedAt).toLocaleString()}.`}
                      onDelete={async (reason) => { await api.delete(`/vitals/${r.id}`, { reason }); await load(); }}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </div>
    </div>
  );
}
