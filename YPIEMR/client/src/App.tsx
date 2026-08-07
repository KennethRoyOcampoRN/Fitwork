import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { BrandingProvider } from "./lib/branding";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";
import Dashboard from "./pages/Dashboard";
import EmployeeSearch from "./pages/EmployeeSearch";
import AllEmployees from "./pages/AllEmployees";
import EmployeeProfile from "./pages/EmployeeProfile";
import NewEmployee from "./pages/NewEmployee";
import EditEmployee from "./pages/EditEmployee";
import AdminUsers from "./pages/AdminUsers";
import AdminLayout from "./pages/AdminLayout";
import AdminTemplates from "./pages/AdminTemplates";
import AdminImport from "./pages/AdminImport";
import AdminAudit from "./pages/AdminAudit";
import AdminBackup from "./pages/AdminBackup";
import AdminCompanies from "./pages/AdminCompanies";
import AdminArchivedEmployees from "./pages/AdminArchivedEmployees";
import AdminReports from "./pages/AdminReports";
import AdminSettingsLayout from "./pages/AdminSettingsLayout";
import AdminBranding from "./pages/AdminBranding";
import NoteLedger from "./pages/NoteLedger";
import NewNote from "./pages/NewNote";
import Reports from "./pages/Reports";
import StandaloneCertificate from "./pages/StandaloneCertificate";
import CertificateVerification from "./pages/CertificateVerification";

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-sm text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <ChangePassword />;
  return children;
}

function RequireAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

// Employee creation/editing is restricted to NURSE and ADMIN (doctors and
// dentists are contracted/visiting clinicians, not regular company
// employees, and can still view but not create/edit demographic records).
// This is a UX guard only — the server enforces the same restriction with
// a real 403, so this can never be the only thing standing in the way.
function RequireNurseOrAdmin({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (user?.role !== "NURSE" && user?.role !== "ADMIN") return <Navigate to="/" replace />;
  return children;
}

// Medical certificate creation is restricted to Doctor/Dentist roles — a UX
// guard only, the server enforces the same restriction with a real 403.
function RequireDoctorOrDentist({ children }: { children: React.ReactElement }) {
  const { user } = useAuth();
  if (user?.role !== "DOCTOR" && user?.role !== "DENTIST") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrandingProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RequireAuth>
                <Layout />
              </RequireAuth>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="/search" element={<EmployeeSearch />} />
            <Route path="/employees/all" element={<AllEmployees />} />
            <Route path="/employees/new" element={<RequireNurseOrAdmin><NewEmployee /></RequireNurseOrAdmin>} />
            <Route path="/employees/:id/edit" element={<RequireNurseOrAdmin><EditEmployee /></RequireNurseOrAdmin>} />
            <Route path="/employees/:id" element={<EmployeeProfile />} />
            <Route path="/employees/:id/notes/new" element={<NewNote />} />
            <Route path="/ledger" element={<NoteLedger />} />
            <Route path="/reports" element={<RequireNurseOrAdmin><Reports /></RequireNurseOrAdmin>} />
            <Route path="/certificates/standalone" element={<RequireDoctorOrDentist><StandaloneCertificate /></RequireDoctorOrDentist>} />
            <Route path="/certificates/verify" element={<CertificateVerification />} />
            <Route path="/admin" element={<RequireAdmin><AdminLayout /></RequireAdmin>}>
              <Route index element={<Navigate to="users" replace />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="companies" element={<AdminCompanies />} />
              <Route path="templates" element={<AdminTemplates />} />
              <Route path="import" element={<AdminImport />} />
              <Route path="archived" element={<AdminArchivedEmployees />} />
              <Route path="reports" element={<AdminReports />} />
              <Route path="settings" element={<AdminSettingsLayout />}>
                <Route index element={<Navigate to="branding" replace />} />
                <Route path="branding" element={<AdminBranding />} />
              </Route>
              <Route path="audit" element={<AdminAudit />} />
              <Route path="backup" element={<AdminBackup />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrandingProvider>
  );
}
