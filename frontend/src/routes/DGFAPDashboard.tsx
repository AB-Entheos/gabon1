import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Banknote, AlertCircle } from "lucide-react";
import { useListCasesQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip } from "@/components/StatusChip";
import { formatXAF } from "@/api/format";
import type { Case } from "@/api/hecApi";

export default function DGFAPDashboard() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading } = useListCasesQuery();
  const queue = (data?.results ?? []).filter(
    (c) => c.status === "AT_APPROVAL" && c.current_step === 5
  );
  const awaiting = queue.filter((c) => c.amount_authorized == null);
  const set = queue.filter((c) => c.amount_authorized != null);

  return (
    <div className="space-y-6">
      <header>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <Banknote size={14} /> {t("nav.queue")} · {t("role.DGFAP")}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{t("dash.dgfap.title", "Amount-decider")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("dash.dgfap.subtitle", "Review the DGFC proposed amount, authorize or set a new amount, then verify to send to the Minister.")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard label={t("dash.dgfap.awaiting", "Awaiting amount")} value={awaiting.length} color="yellow" />
        <KpiCard label={t("dash.dgfap.set", "Amount set · ready to advance")} value={set.length} color="emerald" />
      </div>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{t("dash.dgfap.queue", "Step 5 queue")}</h2>
          <span className="text-xs text-slate-500">{queue.length} {t("common.total", "total")}</span>
        </div>
        {isLoading && <div className="p-5 text-slate-500">{t("common.loading")}</div>}
        {queue.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            {t("dash.dgfap.empty", "No cases at step 5 right now.")}
          </div>
        )}
        {queue.length > 0 && <AmountTable cases={queue} lang={lang} />}
      </section>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: number; color: "yellow" | "emerald" }) {
  const { t } = useTranslation();
  const palette: Record<string, string> = {
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-300",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-3xl font-extrabold text-slate-900">{value}</div>
        <span className={`chip border ${palette[color]}`}>{color === "yellow" ? t("dash.dgfap.waiting", "WAITING") : t("dash.dgfap.ready", "READY")}</span>
      </div>
    </div>
  );
}

function AmountTable({ cases, lang }: { cases: Case[]; lang: "en" | "fr" }) {
  const { t } = useTranslation();
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">UID</th>
              <th className="px-5 py-3">{t("table.claimant")}</th>
              <th className="px-5 py-3">{t("table.type")}</th>
              <th className="px-5 py-3 text-right">{t("table.proposed", "Proposed")}</th>
              <th className="px-5 py-3 text-right">{t("table.amount", "Authorized")}</th>
              <th className="px-5 py-3">{t("table.status")}</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((c) => (
              <tr key={c.uid} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3 font-mono text-xs">
                  <Link to={`/cases/${c.uid}`} className="font-bold text-emerald-700 hover:underline">
                    {c.uid.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-5 py-3 font-medium text-slate-900">{c.claimant_name}</td>
                <td className="px-5 py-3 text-slate-500">{c.case_type}</td>
                <td className="px-5 py-3 text-right font-mono text-sm text-blue-700">
                  {(c as any).amount_proposed ? formatXAF(Number((c as any).amount_proposed), lang) : "—"}
                </td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-900">
                  {c.amount_authorized ? formatXAF(Number(c.amount_authorized), lang) : (
                    <span className="inline-flex items-center gap-1 text-amber-600">
                      <AlertCircle size={12} /> {t("common.pending", "pending")}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3"><StatusChip status={c.status} lang={lang} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {cases.map((c) => (
          <Link key={c.uid} to={`/cases/${c.uid}`} className="block px-4 py-3 hover:bg-slate-50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-900">{c.claimant_name}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono font-bold text-emerald-700">{c.uid.slice(0, 8)}…</span>
                  <span>·</span>
                  <span>{c.case_type}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-4 text-xs">
                  <div>
                    <span className="text-slate-500">{t("table.proposed", "Proposed")}: </span>
                    <span className="font-mono font-semibold text-blue-700">
                      {(c as any).amount_proposed ? formatXAF(Number((c as any).amount_proposed), lang) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">{t("table.amount", "Authorized")}: </span>
                    <span className="font-mono font-semibold text-slate-900">
                      {c.amount_authorized ? formatXAF(Number(c.amount_authorized), lang) : (
                        <span className="text-amber-600">{t("common.pending", "pending")}</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <StatusChip status={c.status} lang={lang} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
