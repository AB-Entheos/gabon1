import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import DashboardShell from "@/components/DashboardShell";
import Login from "@/routes/Login";
import ForgotPassword from "@/routes/ForgotPassword";
import ResetPassword from "@/routes/ResetPassword";
import CBDashboard from "@/routes/CBDashboard";
import CaseWorkspace from "@/routes/CaseWorkspace";
import NewCase from "@/routes/NewCase";
import DisbursedPaymentsPage from "@/routes/DisbursedPaymentsPage";
import StageDashboard from "@/routes/StageDashboard";
import AdminPage from "@/routes/admin/AdminPage";
import Profile from "@/routes/Profile";
import NotificationHistory from "@/routes/NotificationHistory";
import DeletedCasesPage from "@/routes/DeletedCasesPage";
import type { RootState, AppDispatch } from "@/store";
import { setUser, logout } from "@/store/authSlice";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useSelector((s: RootState) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const { i18n } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const theme = useSelector((s: RootState) => s.auth.theme);
  const accessToken = useSelector((s: RootState) => s.auth.accessToken);

  useEffect(() => {
    document.documentElement.lang = i18n.language;
  }, [i18n.language]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Hydrate user from /users/me on mount when we have a token
  useEffect(() => {
    if (!accessToken) return;
    (async () => {
      try {
        const res = await fetch("/api/v1/users/me", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          dispatch(setUser(await res.json()));
        } else {
          dispatch(logout());
        }
      } catch {
        // Network error — keep cached user, don't force logout
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          element={
            <RequireAuth>
              <DashboardShell />
            </RequireAuth>
          }
        >
          <Route index element={<StageDashboard />} />
          <Route path="stages" element={<StageDashboard />} />
          <Route path="cases" element={<CBDashboard />} />
          <Route path="cases/new" element={<NewCase />} />
          <Route path="cases/:uid" element={<CaseWorkspace />} />
          <Route path="committee" element={<Navigate to="/" replace />} />
          <Route path="disbursements" element={<DisbursedPaymentsPage />} />
          <Route path="audit" element={<AdminPage kind="audit" />} />
          <Route path="reports" element={<AdminPage kind="reports" />} />
          <Route path="forms" element={<AdminPage kind="forms" />} />
          <Route path="users" element={<AdminPage kind="users" />} />
          <Route path="deleted-cases" element={<DeletedCasesPage />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<NotificationHistory />} />
          <Route path="closed" element={<AdminPage kind="closed" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
