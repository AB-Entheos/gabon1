import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import DashboardShell from "@/components/DashboardShell";
import Login from "@/routes/Login";
import CBDashboard from "@/routes/CBDashboard";
import ApproverDashboard from "@/routes/ApproverDashboard";
import DGFAPDashboard from "@/routes/DGFAPDashboard";
import AdminDashboard from "@/routes/AdminDashboard";
import CaseWorkspace from "@/routes/CaseWorkspace";
import NewCase from "@/routes/NewCase";
import StageDashboard from "@/routes/StageDashboard";
import AdminPage from "@/routes/admin/AdminPage";
import Profile from "@/routes/Profile";
import type { RootState, AppDispatch } from "@/store";
import { setUser, logout } from "@/store/authSlice";

function HomeRouter() {
  const { t } = useTranslation();
  const role = useSelector((s: RootState) => s.auth.user?.role);
  if (!role) return <Navigate to="/login" replace />;
  switch (role) {
    case "CB": return <CBDashboard />;
    case "AB": return <ApproverDashboard step={2} title={t("dash.ab.title", "AB Entheos — Step 2")} subtitle={t("dash.ab.subtitle", "Operational validation.")} />;
    case "WCS": return <ApproverDashboard step={3} title={t("dash.wcs.title", "WCS — Step 3")} subtitle={t("dash.wcs.subtitle", "Technical partner review.")} />;
    case "DGFC": return <ApproverDashboard step={4} title={t("dash.dgfc.title", "DGFC — Step 4")} subtitle={t("dash.dgfc.subtitle", "Faune & contrôle review.")} />;
    case "DGFAP": return <DGFAPDashboard />;
    case "MINISTER": return <ApproverDashboard step={6} title={t("dash.minister.title", "Minister — Step 3")} subtitle={t("dash.minister.subtitle", "Terminal ministerial approval.")} />;
    case "ADMIN": return <AdminDashboard />;
    case "SUPER_ADMIN": return <AdminDashboard />;
    default: return <div>{t("dash.unknown_role", "Unknown role")}</div>;
  }
}

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
        <Route
          element={
            <RequireAuth>
              <DashboardShell />
            </RequireAuth>
          }
        >
          <Route index element={<HomeRouter />} />
          <Route path="stages" element={<StageDashboard />} />
          <Route path="cases" element={<CBDashboard />} />
          <Route path="cases/new" element={<NewCase />} />
          <Route path="cases/:uid" element={<CaseWorkspace />} />
          <Route path="committee" element={<HomeRouter />} />
          <Route path="audit" element={<AdminPage kind="audit" />} />
          <Route path="reports" element={<AdminPage kind="reports" />} />
          <Route path="forms" element={<AdminPage kind="forms" />} />
          <Route path="payments" element={<AdminPage kind="payments" />} />
          <Route path="users" element={<AdminPage kind="users" />} />
          <Route path="profile" element={<Profile />} />
          <Route path="closed" element={<AdminPage kind="closed" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
