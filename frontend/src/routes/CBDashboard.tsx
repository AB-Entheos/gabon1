import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { FilePlus, ClipboardList, AlertTriangle } from "lucide-react";
import { useListCasesQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip } from "@/components/StatusChip";
import { formatDate, formatXAF } from "@/api/format";
import type { Case } from "@/api/hecApi";

export default function CBDashboard() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading, error } = useListCasesQuery();

  const cases = data?.results ?? [];
  const draft = cases.filter((c) => c.status === "DRAFT");
  const inFlight = cases.filter((c) => c.status !== "DRAFT" && c.status !== "CLOSED");
  const closed = cases.filter((c) => c.status === "CLOSED" || c.status === "APPROVED");

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("nav.dashboard")}
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{t("dash.cb.title", "CB workspace")}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("dash.cb.subtitle", "Open new cases, upload evidence, submit incident reports.")}
          </p>
        </div>
        <Link to="/cases/new" className="btn-primary">
          <FilePlus size={16} />
          {t("dash.cb.new_case", "New case")}
        </Link>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard label={t("dash.cb.kpi.drafts", "Drafts")} value={draft.length} color="slate" />
        <KpiCard label={t("dash.cb.kpi.in_progress", "In progress")} value={inFlight.length} color="yellow" />
        <KpiCard label={t("dash.cb.kpi.closed", "Closed")} value={closed.length} color="emerald" />
      </div>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            <ClipboardList size={16} className="mr-2 inline text-slate-400" />
            {t("dash.recent", "Recent cases")}
          </h2>
        </div>
        {isLoading && <div className="p-5 text-slate-500">{t("common.loading", "Loading…")}</div>}
        {error && (
          <div className="m-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertTriangle size={16} /> {t("dash.load_error", "Failed to load cases.")}
          </div>
        )}
        {data && cases.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            {t("dash.cb.empty", "No cases yet. Click 'New case' to start.")}
          </div>
        )}
        {data && cases.length > 0 && <CasesTable cases={cases} lang={lang} />}
      </section>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: "slate" | "yellow" | "emerald" }) {
  const palette: Record<string, string> = {
    slate:   "bg-slate-50 text-slate-700 border-slate-200",
    yellow:  "bg-yellow-50 text-yellow-700 border-yellow-300",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-3xl font-extrabold text-slate-900">{value}</div>
        <span className={`chip border ${palette[color]}`}>{label.split(' ')[0]}</span>
      </div>
    </div>
  );
}

function CasesTable({ cases, lang }: { cases: Case[]; lang: "en" | "fr" }) {
  const { t } = useTranslation();
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">UID</th>
              <th className="px-5 py-3">{t("table.claimant", "Claimant")}</th>
              <th className="px-5 py-3">{t("table.type", "Type")}</th>
              <th className="px-5 py-3">{t("table.incident", "Incident")}</th>
              <th className="px-5 py-3">{t("table.status", "Status")}</th>
              <th className="px-5 py-3 text-right">{t("table.amount", "Amount")}</th>
            </tr>
          </thead>
          <tbody>
            {cases.slice(0, 25).map((c) => (
              <tr key={c.uid} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-xs text-slate-500">
                  <Link to={`/cases/${c.uid}`} className="text-emerald-700 hover:underline">
                    {c.uid.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-5 py-3 font-medium text-slate-900">{c.claimant_name}</td>
                <td className="px-5 py-3 text-slate-500">{c.case_type}</td>
                <td className="px-5 py-3 text-slate-500">{formatDate(c.incident_at, lang)}</td>
                <td className="px-5 py-3"><StatusChip status={c.status} lang={lang} /></td>
                <td className="px-5 py-3 text-right font-mono text-slate-700">
                  {c.amount_authorized ? formatXAF(Number(c.amount_authorized), lang) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {cases.slice(0, 25).map((c) => (
          <Link key={c.uid} to={`/cases/${c.uid}`} className="block px-4 py-3 hover:bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{c.claimant_name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono">{c.uid.slice(0, 8)}…</span>
                  <span>·</span>
                  <span>{c.case_type}</span>
                  <span>·</span>
                  <span>{formatDate(c.incident_at, lang)}</span>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusChip status={c.status} lang={lang} />
                <div className="text-xs font-mono text-slate-700">
                  {c.amount_authorized ? formatXAF(Number(c.amount_authorized), lang) : "—"}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
