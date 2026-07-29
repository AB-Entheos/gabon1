import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Banknote, AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { useListCasesQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip } from "@/components/StatusChip";
import { formatDate, formatXAF } from "@/api/format";
import type { Case } from "@/api/hecApi";

export default function DisbursementsPage() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading, error } = useListCasesQuery({ status: "APPROVED" });

  const cases = data?.results ?? [];

  const totalAuthorized = cases.reduce(
    (sum, c) => sum + Number(c.amount_authorized ?? 0),
    0,
  );
  const totalDisbursed = cases.reduce(
    (sum, c) => sum + Number(c.disbursement_summary?.disbursed_xaf ?? 0),
    0,
  );
  const totalRemaining = totalAuthorized - totalDisbursed;

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("nav.disbursements")}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {t("dash.wcs_disburse.title", "Minister Approved — Disbursements")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("dash.wcs_disburse.subtitle", "Cases approved by the Minister, ready for disbursement processing.")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          label={t("dash.wcs_disburse.kpi.authorized", "Total Authorized")}
          value={totalAuthorized}
          color="emerald"
          lang={lang}
        />
        <KpiCard
          label={t("dash.wcs_disburse.kpi.disbursed", "Total Disbursed")}
          value={totalDisbursed}
          color="blue"
          lang={lang}
        />
        <KpiCard
          label={t("dash.wcs_disburse.kpi.remaining", "Remaining")}
          value={totalRemaining}
          color="amber"
          lang={lang}
        />
      </div>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            <Banknote size={16} className="mr-2 inline text-slate-400" />
            {t("dash.wcs_disburse.list_title", "Approved Cases for Disbursement")}
          </h2>
          <span className="text-xs text-slate-500">
            {cases.length} {t("common.cases", "cases")}
          </span>
        </div>

        {isLoading && (
          <div className="p-5 text-slate-500">{t("common.loading", "Loading…")}</div>
        )}
        {error && (
          <div className="m-5 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            <AlertTriangle size={16} /> {t("dash.load_error", "Failed to load cases.")}
          </div>
        )}
        {data && cases.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            {t("dash.wcs_disburse.empty", "No minister-approved cases pending disbursement.")}
          </div>
        )}
        {data && cases.length > 0 && <DisbursementsTable cases={cases} lang={lang} />}
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  color,
  lang,
}: {
  label: string;
  value: number;
  color: "emerald" | "blue" | "amber";
  lang: "en" | "fr";
}) {
  const palette: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
  };
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2">
        <div className="text-2xl font-extrabold text-slate-900">{formatXAF(value, lang)}</div>
      </div>
    </div>
  );
}

function DisbursementsTable({ cases, lang }: { cases: Case[]; lang: "en" | "fr" }) {
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
              <th className="px-5 py-3">{t("table.village", "Village")}</th>
              <th className="px-5 py-3">{t("table.status", "Status")}</th>
              <th className="px-5 py-3 text-right">{t("table.authorized", "Authorized")}</th>
              <th className="px-5 py-3 text-right">{t("table.disbursed", "Disbursed")}</th>
              <th className="px-5 py-3 text-right">{t("table.remaining", "Remaining")}</th>
              <th className="px-5 py-3 text-right">{t("table.utilization", "Util.")}</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const ds = c.disbursement_summary;
              return (
                <tr key={c.uid} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-5 py-3 font-mono text-xs text-slate-500">
                    <Link to={`/cases/${c.uid}`} className="text-emerald-700 hover:underline">
                      {c.uid.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-slate-900">{c.claimant_name}</td>
                  <td className="px-5 py-3 text-slate-500">{c.case_type}</td>
                  <td className="px-5 py-3 text-slate-500">{c.village_name || c.village_name_text || "—"}</td>
                  <td className="px-5 py-3"><StatusChip status={c.status} lang={lang} /></td>
                  <td className="px-5 py-3 text-right font-mono text-slate-700">
                    {c.amount_authorized ? formatXAF(Number(c.amount_authorized), lang) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-700">
                    {ds?.disbursed_xaf ? formatXAF(Number(ds.disbursed_xaf), lang) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-slate-700">
                    {ds?.remaining_xaf ? formatXAF(Number(ds.remaining_xaf), lang) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-slate-500">
                    {ds?.utilization_pct != null ? `${ds.utilization_pct}%` : "—"}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      to={`/cases/${c.uid}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline"
                    >
                      {t("common.open", "Open")}
                      <ArrowRight size={12} />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {cases.map((c) => {
          const ds = c.disbursement_summary;
          return (
            <Link key={c.uid} to={`/cases/${c.uid}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{c.claimant_name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{c.uid.slice(0, 8)}…</span>
                    <span>·</span>
                    <span>{c.case_type}</span>
                    <span>·</span>
                    <span>{c.village_name || c.village_name_text || "—"}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusChip status={c.status} lang={lang} />
                  {ds && (
                    <div className="text-xs text-slate-500">
                      {formatXAF(Number(ds.disbursed_xaf ?? 0), lang)} / {formatXAF(Number(c.amount_authorized ?? 0), lang)}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
