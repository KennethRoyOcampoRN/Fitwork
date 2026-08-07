import React from "react";

export interface EmployeeFormValues {
  employeeCode: string; lastName: string; firstName: string; middleName: string; suffix: string;
  dateOfBirth: string; sex: string; civilStatus: string; bloodType: string; religion: string; department: string;
  position: string; employmentStatus: string; dateHired: string; mobileNumber: string; address: string;
  emergencyContactName: string; emergencyContactRelation: string; emergencyContactNumber: string;
  knownAllergies: string; chronicConditions: string; companyId: string;
}

export const EMPTY_EMPLOYEE_FORM: EmployeeFormValues = {
  employeeCode: "", lastName: "", firstName: "", middleName: "", suffix: "",
  dateOfBirth: "", sex: "", civilStatus: "", bloodType: "", religion: "", department: "",
  position: "", employmentStatus: "", dateHired: "", mobileNumber: "", address: "",
  emergencyContactName: "", emergencyContactRelation: "", emergencyContactNumber: "",
  knownAllergies: "", chronicConditions: "", companyId: "",
};

export interface CompanyOption {
  id: string;
  name: string;
  isPrimary?: boolean;
  isActive?: boolean;
}

interface Props {
  values: EmployeeFormValues;
  onChange: <K extends keyof EmployeeFormValues>(key: K, value: string) => void;
  employeeCodeLocked?: boolean;
  companies?: CompanyOption[];
}

export default function EmployeeFormFields({ values, onChange, employeeCodeLocked, companies = [] }: Props) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Employee code *</label>
          <input
            value={values.employeeCode}
            onChange={(e) => onChange("employeeCode", e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm disabled:bg-gray-100 disabled:text-gray-500"
            required
            disabled={employeeCodeLocked}
            title={employeeCodeLocked ? "Employee code cannot be changed after creation — it's the permanent key linking all of this employee's records." : undefined}
          />
          {employeeCodeLocked && <p className="text-xs text-gray-400 mt-1">Locked — this is the permanent key linking all of this employee's records.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Sex</label>
          <select value={values.sex} onChange={(e) => onChange("sex", e.target.value)} className="w-full border rounded px-2 py-1 text-sm">
            <option value="">—</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Last name *</label>
          <input value={values.lastName} onChange={(e) => onChange("lastName", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">First name *</label>
          <input value={values.firstName} onChange={(e) => onChange("firstName", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Middle name</label>
          <input value={values.middleName} onChange={(e) => onChange("middleName", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Suffix</label>
          <input value={values.suffix} onChange={(e) => onChange("suffix", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Date of birth</label>
          <input type="date" value={values.dateOfBirth} onChange={(e) => onChange("dateOfBirth", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Civil status</label>
          <input value={values.civilStatus} onChange={(e) => onChange("civilStatus", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Blood type</label>
          <input value={values.bloodType} onChange={(e) => onChange("bloodType", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g. O+" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Religion</label>
          <input value={values.religion} onChange={(e) => onChange("religion", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Company</label>
          <select
            value={values.companyId}
            onChange={(e) => onChange("companyId", e.target.value)}
            className="w-full border rounded px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {companies.filter((c) => c.isActive !== false || c.id === values.companyId).map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.isPrimary ? " (Primary)" : ""}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">Managed in Admin &gt; Companies — add a new company there first if it's not listed.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Department</label>
          <input value={values.department} onChange={(e) => onChange("department", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Position</label>
          <input value={values.position} onChange={(e) => onChange("position", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Employment status</label>
          <input value={values.employmentStatus} onChange={(e) => onChange("employmentStatus", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g. Regular" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Date hired</label>
          <input type="date" value={values.dateHired} onChange={(e) => onChange("dateHired", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Mobile number</label>
          <input value={values.mobileNumber} onChange={(e) => onChange("mobileNumber", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Address</label>
        <input value={values.address} onChange={(e) => onChange("address", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Emergency contact name</label>
          <input value={values.emergencyContactName} onChange={(e) => onChange("emergencyContactName", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Relation</label>
          <input value={values.emergencyContactRelation} onChange={(e) => onChange("emergencyContactRelation", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Emergency contact number</label>
          <input value={values.emergencyContactNumber} onChange={(e) => onChange("emergencyContactNumber", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Known allergies</label>
        <textarea value={values.knownAllergies} onChange={(e) => onChange("knownAllergies", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Chronic conditions</label>
        <textarea value={values.chronicConditions} onChange={(e) => onChange("chronicConditions", e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
      </div>
    </>
  );
}
