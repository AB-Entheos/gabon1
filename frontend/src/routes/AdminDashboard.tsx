import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { ShieldCheck, FormInput, FileStack, ScrollText } from "lucide-react";
import { useListCasesQuery, useListFormsQuery } from "@/api/hecApi";
import { useGetStagesQuery } from "@/api/stageApi";
import { formatDate } from "@/api/format";
import type { RootState } from "@/store";
import { Link } from "react-router-dom";

export default function AdminDashboard() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const user = useSelector((s: RootState) => s.auth.user);
  const { data: cases } = useListCasesQuery();
  const { data: forms } = useListFormsQuery();
  const { data: stages } = useGetStagesQuery();

  const isSuper = user?.role === "SUPER_ADMIN";

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {isSuper ? <ShieldCheck size={14} /> : null}
          {t("nav.dashboard")}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {isSuper ? t("dash.admin.title_super", "System administration") : t("dash.admin.title", "Admin console")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isSuper
            ? t("dash.admin.subtitle_super", "Full system access: users, forms, audit, payments, system settings.")
            : t("dash.admin.subtitle", "Form definitions, audit, reports, payments.")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label={t("dash.admin.kpi.cases", "Cases")}
          value={stages?.total ?? cases?.count ?? 0}
          color="primary"
          icon={<FileStack size={16} />}
        />
        <KpiCard
          label={t("dash.admin.kpi.forms", "Published forms")}
          value={forms?.count ?? 0}
          color="accent"
          icon={<FormInput size={16} />}
        />
        <KpiCard
          label={t("dash.admin.kpi.approved", "Approved")}
          value={stages?.approved ?? 0}
          color="emerald"
          icon={<ScrollText size={16} />}
        />
        <KpiCard
          label={t("dash.admin.kpi.first_aid", "Accelerated benefit")}
          value={stages?.accelerated_benefit_released ?? 0}
          color="yellow"
          icon={<ShieldCheck size={16} />}
        />
      </div>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">
          {t("dash.admin.forms", "Form definitions")}
        </h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {forms?.results.map((f) => (
            <li key={f.uid} className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                <span className="chip bg-blue-100 text-blue-700 font-mono text-[10px]">
                  {f.slug}@{f.version}
                </span>
                <span className="text-sm font-medium text-slate-900">{f.title}</span>
              </div>
              <div className="text-xs text-slate-500">
                scope: {f.role_scope} · {formatDate(f.published_at, lang)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">Quick links</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          <QuickLink to="/stages" label={t("nav.stages", "Committee")} />
          <QuickLink to="/audit" label={t("nav.audit", "Audit")} />
          <QuickLink to="/reports" label={t("nav.reports", "Reports")} />
          <QuickLink to="/payments" label={t("nav.payments", "Payments")} />
          {isSuper && <QuickLink to="/users" label={t("nav.users", "Users")} />}
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label, value, color, icon,
}: { label: string; value: number; color: string; icon?: React.ReactNode }) {
  const palette: Record<string, string> = {
    primary: "bg-emerald-50 text-emerald-700 border-emerald-200",
    accent: "bg-blue-50 text-blue-700 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-300",
  };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        {icon && <span className="text-slate-400">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-3xl font-extrabold text-slate-900">{value}</div>
        <span className={`chip border ${palette[color]}`}>{color}</span>
      </div>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50 hover:text-emerald-700"
    >
      {label}
      <span className="text-slate-400">→</span>
    </Link>
  );
}
