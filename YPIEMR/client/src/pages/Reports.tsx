import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import ScopeSelect, { DEFAULT_SCOPE, ScopeValue, scopeParams, useCompanies } from "../components/ScopeSelect";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function downloadFile(url: string, filename: string): Promise<string | null> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "Download failed";
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(objectUrl);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Download failed";
  }
}

function useDepartments() {
  const [departments, setDepartments] = useState<string[]>([]);
  useEffect(() => { api.get<string[]>("/reports/departments").then(setDepartments).catch(() => {}); }, []);
  return departments;
}

function DepartmentSelect({ value, onChange, departments }: { value: string; onChange: (v: string) => void; departments: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border rounded px-2 py-1 text-sm">
      <option value="">All departments</option>
      {departments.map((d) => <option key={d} value={d}>{d}</option>)}
    </select>
  );
}

function ReportCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <h2 className="font-medium mb-1">{title}</h2>
      <p className="text-xs text-gray-500 mb-3">{description}</p>
      {children}
    </div>
  );
}

function DownloadButtons({ busy, onWord, onExcel }: { busy: boolean; onWord: () => void; onExcel: () => void }) {
  return (
    <div className="flex gap-2">
      <button onClick={onWord} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
        {busy ? "Preparing..." : "Download Word report"}
      </button>
      <button onClick={onExcel} disabled={busy} className="bg-gray-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
        {busy ? "Preparing..." : "Download Excel (data only)"}
      </button>
    </div>
  );
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Shared shape for the four month/year-filterable CSV reports (Illness by
// month, Illness by department, Medications by department, Lab/diagnostic
// tests by department) — a single generic section rather than four
// near-identical copies, since they only differ in endpoint/title/
// description. Unlike the Word/Excel reports above, these are a single
// "Download CSV" button, matching routes/reportsCsv.ts's plain text/csv
// export (same convention as the Audit Log's CSV export) rather than the
// heavier docx/xlsx report builders.
function MonthYearCsvReportSection({ endpoint, filenamePrefix, title, description, departments }: {
  endpoint: string; filenamePrefix: string; title: string; description: string; departments: string[];
}) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [month, setMonth] = useState(""); // "" = whole year
  const [department, setDepartment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams({ year });
    if (month) params.set("month", month);
    if (department) params.set("department", department);
    return params;
  }

  async function download() {
    setBusy(true);
    setError(null);
    const period = month ? `${year}-${month.padStart(2, "0")}` : year;
    const err = await downloadFile(`/api/reports/${endpoint}/export.csv?${buildParams()}`, `${filenamePrefix}-${period}.csv`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard title={title} description={description}>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div>
          <label className="block text-xs font-medium mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="">Whole year</option>
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
        </div>
      </div>
      <button onClick={download} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
        {busy ? "Preparing..." : "Download CSV"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </ReportCard>
  );
}

interface ApeDentalSectionProps {
  departments: string[];
  companies: ReturnType<typeof useCompanies>;
  kind: "ape-summary" | "ape-detailed" | "dental-summary" | "dental-detailed";
  title: string;
  description: string;
  yearParam: "examYear" | "year";
}

function YearReportSection({ departments, companies, kind, title, description, yearParam }: ApeDentalSectionProps) {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState("");
  const [compareYears, setCompareYears] = useState("0");
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams({ [yearParam]: year, compareYears, ...scopeParams(scope) });
    if (department) params.set("department", department);
    return params;
  }

  async function download(format: "word" | "excel") {
    setBusy(true);
    setError(null);
    const ext = format === "word" ? "docx" : "xlsx";
    const err = await downloadFile(`/api/reports/${kind}/${format}?${buildParams()}`, `${kind}-${year}.${ext}`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard title={title} description={description}>
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div>
          <label className="block text-xs font-medium mb-1">{yearParam === "examYear" ? "Exam year" : "Year"}</label>
          <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Compare against</label>
          <select value={compareYears} onChange={(e) => setCompareYears(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="0">This year only</option>
            <option value="1">1 prior year</option>
            <option value="2">2 prior years</option>
          </select>
        </div>
        <ScopeSelect value={scope} onChange={setScope} companies={companies} />
      </div>
      <DownloadButtons busy={busy} onWord={() => download("word")} onExcel={() => download("excel")} />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </ReportCard>
  );
}

function ApeComprehensiveSection({ departments, companies }: { departments: string[]; companies: ReturnType<typeof useCompanies> }) {
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [department, setDepartment] = useState("");
  const [compareYears, setCompareYears] = useState("0");
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    const params = new URLSearchParams({ examYear, compareYears, ...scopeParams(scope) });
    if (department) params.set("department", department);
    const err = await downloadFile(`/api/reports/ape-comprehensive/word?${params}`, `ape-comprehensive-${examYear}.docx`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard
      title="APE Comprehensive Report"
      description="Full narrative report with charts for every APE component (anthropometrics/BMI, blood pressure, visual acuity, audiometry, chest X-ray, CBC, urinalysis, fecalysis, ECG, dental cross-reference), demographics, year-over-year comparison, follow-up findings, and a draft recommendations section. Word only — this report is defined by its narrative and charts, unlike the data-only Excel exports above."
    >
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div>
          <label className="block text-xs font-medium mb-1">Exam year</label>
          <input type="number" value={examYear} onChange={(e) => setExamYear(e.target.value)} className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Compare against</label>
          <select value={compareYears} onChange={(e) => setCompareYears(e.target.value)} className="border rounded px-2 py-1 text-sm">
            <option value="0">This year only</option>
            <option value="1">1 prior year</option>
            <option value="2">2 prior years</option>
          </select>
        </div>
        <ScopeSelect value={scope} onChange={setScope} companies={companies} />
      </div>
      <button onClick={download} disabled={busy || !examYear} className="bg-clinic-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
        {busy ? "Generating comprehensive report…" : "Download Word report"}
      </button>
      {busy && <p className="text-xs text-gray-500 mt-2">This report renders a chart for every section and can take a while for larger populations — please keep this tab open.</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </ReportCard>
  );
}

function IllnessByDepartmentSection({ departments, companies }: { departments: string[]; companies: ReturnType<typeof useCompanies> }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [department, setDepartment] = useState("");
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams({ from, to, ...scopeParams(scope) });
    if (department) params.set("department", department);
    return params;
  }

  async function download(format: "word" | "excel") {
    setBusy(true);
    setError(null);
    const ext = format === "word" ? "docx" : "xlsx";
    const err = await downloadFile(`/api/reports/illness-by-department/${format}?${buildParams()}`, `illness-by-department-${from}_to_${to}.${ext}`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard title="Illness / Complaint Summary by Department" description="Counts of each illness/condition category per department for a selected period. Categories are auto-suggested at charting time from the diagnosis text and can be corrected by Nurse/Admin afterward.">
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
        </div>
        <ScopeSelect value={scope} onChange={setScope} companies={companies} />
      </div>
      <DownloadButtons busy={busy} onWord={() => download("word")} onExcel={() => download("excel")} />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </ReportCard>
  );
}

function IllnessByAgeSection({ departments, companies }: { departments: string[]; companies: ReturnType<typeof useCompanies> }) {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [department, setDepartment] = useState("");
  const [exactAge, setExactAge] = useState("");
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildParams(): URLSearchParams {
    const params = new URLSearchParams({ from, to, ...scopeParams(scope) });
    if (department) params.set("department", department);
    if (exactAge) params.set("exactAge", exactAge);
    return params;
  }

  async function download(format: "word" | "excel") {
    setBusy(true);
    setError(null);
    const ext = format === "word" ? "docx" : "xlsx";
    const err = await downloadFile(`/api/reports/illness-by-age/${format}?${buildParams()}`, `illness-by-age-${from}_to_${to}.${ext}`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard title="Illness / Condition Report by Age" description="Illness/condition data broken down by age bracket (or filtered to one exact age), computed from each employee's date of birth as of their visit date.">
      <div className="flex flex-wrap gap-2 items-end mb-3">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Department</label>
          <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Exact age (optional)</label>
          <input type="number" min={0} max={120} value={exactAge} onChange={(e) => setExactAge(e.target.value)} placeholder="Any" className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <ScopeSelect value={scope} onChange={setScope} companies={companies} />
      </div>
      <DownloadButtons busy={busy} onWord={() => download("word")} onExcel={() => download("excel")} />
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </ReportCard>
  );
}

const CUSTOM_CATEGORIES = [
  { value: "DOCTOR", label: "Doctor's Notes" },
  { value: "NURSE", label: "Nurse's Notes" },
  { value: "DENTIST", label: "Dentist's Notes" },
  { value: "MEDICATIONS", label: "Medications" },
  { value: "APE", label: "Annual Physical Exams" },
  { value: "VITALS", label: "Vitals" },
  { value: "DRUG_TEST", label: "Drug Test Results" },
  { value: "PRE_EMPLOYMENT", label: "Pre-Employment Exams" },
];

interface EmployeeHit { id: string; employeeCode: string; firstName: string; lastName: string }

function CustomReportBuilderSection({ departments, companies }: { departments: string[]; companies: ReturnType<typeof useCompanies> }) {
  const [categories, setCategories] = useState<string[]>(CUSTOM_CATEGORIES.map((c) => c.value));
  const [department, setDepartment] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [scope, setScope] = useState<ScopeValue>(DEFAULT_SCOPE);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EmployeeHit[]>([]);
  const [selected, setSelected] = useState<EmployeeHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(value: string) {
    setCategories((cur) => cur.includes(value) ? cur.filter((c) => c !== value) : [...cur, value]);
  }

  useEffect(() => {
    if (!query.trim()) { setHits([]); return; }
    const t = setTimeout(() => {
      api.get<{ results: EmployeeHit[] }>(`/employees/search?q=${encodeURIComponent(query)}`).then((data) => setHits(data.results));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function addEmployee(e: EmployeeHit) {
    setSelected((cur) => (cur.some((s) => s.id === e.id) ? cur : [...cur, e]));
    setQuery("");
    setHits([]);
  }

  function removeEmployee(id: string) {
    setSelected((cur) => cur.filter((s) => s.id !== id));
  }

  function buildParams(): URLSearchParams | null {
    if (categories.length === 0) {
      setError("Select at least one category");
      return null;
    }
    const params = new URLSearchParams({ categories: categories.join(",") });
    if (selected.length > 0) {
      params.set("employeeIds", selected.map((s) => s.id).join(","));
    } else {
      if (department) params.set("department", department);
      const sp = scopeParams(scope);
      for (const [k, v] of Object.entries(sp)) params.set(k, v);
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params;
  }

  async function download(format: "pdf" | "excel") {
    const params = buildParams();
    if (!params) return;
    setBusy(true);
    setError(null);
    const path = format === "pdf" ? "custom/export" : "custom/excel";
    const ext = format === "pdf" ? "pdf" : "xlsx";
    const err = await downloadFile(`/api/reports/${path}?${params}`, `custom-report-${today()}.${ext}`);
    setError(err);
    setBusy(false);
  }

  return (
    <ReportCard title="Custom Report Builder" description="Pick exactly what to include, then generate a combined PDF (or a data-only Excel workbook) across a department, the whole company, or specific employees you choose below.">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">Include</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {CUSTOM_CATEGORIES.map((c) => (
              <label key={c.value} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={categories.includes(c.value)} onChange={() => toggle(c.value)} />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div>
            <label className="block text-xs font-medium mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Department (ignored if specific employees are picked below)</label>
            <DepartmentSelect value={department} onChange={setDepartment} departments={departments} />
          </div>
          <div className={selected.length > 0 ? "opacity-50 pointer-events-none" : ""}>
            <ScopeSelect value={scope} onChange={setScope} companies={companies} />
          </div>
        </div>
        {selected.length > 0 && <p className="text-xs text-gray-400">Scope and department are ignored while specific employees are selected below.</p>}

        <div>
          <label className="block text-xs font-medium mb-1">Specific employees (optional — leave empty to use scope/department)</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or code..."
            className="border rounded px-2 py-1 text-sm w-full max-w-sm"
          />
          {hits.length > 0 && (
            <div className="border rounded mt-1 max-w-sm bg-white shadow-sm">
              {hits.map((h) => (
                <button key={h.id} onClick={() => addEmployee(h)} className="block w-full text-left px-2 py-1 text-sm hover:bg-gray-50">
                  {h.lastName}, {h.firstName} <span className="text-gray-400">#{h.employeeCode}</span>
                </button>
              ))}
            </div>
          )}
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.map((s) => (
                <span key={s.id} className="bg-clinic-50 brand-chip text-clinic-100 text-xs rounded-full px-2 py-1 flex items-center gap-1">
                  {s.lastName}, {s.firstName}
                  <button onClick={() => removeEmployee(s.id)} className="text-clinic-500 hover:text-white">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={() => download("pdf")} disabled={busy} className="bg-clinic-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? "Preparing..." : "Download PDF report"}
          </button>
          <button onClick={() => download("excel")} disabled={busy} className="bg-gray-600 text-white rounded px-4 py-1.5 text-sm disabled:opacity-50">
            {busy ? "Preparing..." : "Download Excel (data only)"}
          </button>
        </div>
      </div>
    </ReportCard>
  );
}

export default function Reports() {
  const departments = useDepartments();
  const companies = useCompanies();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Reports</h1>
      <p className="text-sm text-gray-500">
        Company-wide reporting tools. Every report can be scoped to the primary company, a specific company, or all
        employees. The APE, Dental, and Illness reports export as editable Word documents or data-only Excel
        workbooks; the Custom Report Builder exports a combined PDF or a data-only Excel workbook; the APE
        Comprehensive report is Word-only, since it's defined by its narrative and charts rather than raw data.
      </p>
      <YearReportSection
        departments={departments} companies={companies} kind="ape-summary" yearParam="examYear"
        title="APE Summary Report"
        description="Counts by fitness classification and department, editable Word document or data-only Excel. Optionally compare against prior year(s)."
      />
      <YearReportSection
        departments={departments} companies={companies} kind="ape-detailed" yearParam="examYear"
        title="APE Detailed Report"
        description="Full per-employee exam detail, editable Word document or data-only Excel. Optionally compare against prior year(s)."
      />
      <ApeComprehensiveSection departments={departments} companies={companies} />
      <YearReportSection
        departments={departments} companies={companies} kind="dental-summary" yearParam="year"
        title="Dental Summary Report"
        description="Visit counts by disposition and department, sourced from dentist visit notes. Editable Word document or data-only Excel."
      />
      <YearReportSection
        departments={departments} companies={companies} kind="dental-detailed" yearParam="year"
        title="Dental Detailed Report"
        description="Full per-visit dental detail plus a current tooth-chart snapshot (reference only, no history). Editable Word document or data-only Excel."
      />
      <IllnessByDepartmentSection departments={departments} companies={companies} />
      <IllnessByAgeSection departments={departments} companies={companies} />
      <CustomReportBuilderSection departments={departments} companies={companies} />
      <MonthYearCsvReportSection
        departments={departments} endpoint="illness-by-month" filenamePrefix="illness-by-month"
        title="Illness per Month/Year"
        description="Counts of each illness/condition category for a selected month or year. CSV export."
      />
      <MonthYearCsvReportSection
        departments={departments} endpoint="illness-by-department-month" filenamePrefix="illness-by-department"
        title="Illness per Department per Month/Year"
        description="Illness/condition category counts cross-tabbed by department, for a selected month or year. CSV export."
      />
      <MonthYearCsvReportSection
        departments={departments} endpoint="medications-by-department" filenamePrefix="medications-by-department"
        title="Medications Dispensed per Department per Month/Year"
        description="Count of medications dispensed per department, for a selected month or year. CSV export."
      />
      <MonthYearCsvReportSection
        departments={departments} endpoint="lab-tests-by-department" filenamePrefix="lab-tests-by-department"
        title="Lab/Diagnostic Test Report per Month/Year/Department"
        description="Lab/diagnostic test counts cross-tabbed by test type and department, for a selected month or year. Includes matching results recorded on an Annual Physical Exam (e.g. chest X-ray, CBC) as separate rows tagged Source = APE, alongside standalone Lab Test entries. CSV export."
      />
    </div>
  );
}
