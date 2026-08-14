import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { ArrowRight, Banknote, Calendar, UserRound } from "lucide-react";
import { useListAllDisbursementsQuery } from "@/api/hecApi";
import type { Disbursement } from "@/api/hecApi";
import type { RootState } from "@/store";
import { formatXAF } from "@/api/format";
import { StatusChip } from "@/components/StatusChip";

export default function DisbursedPaymentsPage() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading, isError } = useListAllDisbursementsQuery();
  const disbursements = data?.results ?? [];
  const total = disbursements.reduce((sum, item) => sum + item.amount_xaf, 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("nav.disbursements", "Disbursements")}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">
          {t("dash.disbursed.title", "Disbursed payments")}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("dash.disbursed.subtitle", "All recorded disbursements and their associated cases.")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <KpiCard label={t("dash.disbursed.count", "Recorded disbursements")} value={disbursements.length.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")} />
        <KpiCard label={t("dash.disbursed.total", "Total disbursed")} value={formatXAF(total, lang)} />
      </div>

      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            <Banknote size={16} className="mr-2 inline text-slate-400" />
            {t("dash.disbursed.list_title", "Recorded disbursements")}
          </h2>
          <span className="text-xs text-slate-500">{disbursements.length}</span>
        </div>

        {isLoading && <div className="p-5 text-sm text-slate-500">{t("common.loading", "Loading…")}</div>}
        {isError && <div className="p-5 text-sm text-rose-700">{t("dash.load_error", "Failed to load disbursements.")}</div>}
        {!isLoading && !isError && disbursements.length === 0 && (
          <div className="p-10 text-center text-sm text-slate-500">{t("dash.disbursed.empty", "No recorded disbursements.")}</div>
        )}
        {disbursements.length > 0 && <DisbursementTable items={disbursements} lang={lang} />}
      </section>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-extrabold text-slate-900">{value}</div>
    </div>
  );
}

function DisbursementTable({ items, lang }: { items: Disbursement[]; lang: "en" | "fr" }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-5 py-3">{t("table.claimant", "Claimant")}</th>
              <th className="px-5 py-3">{t("table.payment_date", "Payment date")}</th>
              <th className="px-5 py-3">{t("table.recipient", "Recipient")}</th>
              <th className="px-5 py-3">{t("table.purpose", "Purpose")}</th>
              <th className="px-5 py-3 text-right">{t("table.amount", "Amount")}</th>
              <th className="px-5 py-3">{t("table.status", "Status")}</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Link to={`/cases/${item.case_uid}`} className="font-medium text-emerald-700 hover:underline">{item.claimant_name}</Link>
                  <div className="font-mono text-xs text-slate-400">{item.case_uid.slice(0, 8)}…</div>
                </td>
                <td className="px-5 py-3 text-slate-600"><Calendar size={13} className="mr-1 inline" />{item.payment_date}</td>
                <td className="px-5 py-3 text-slate-600"><UserRound size={13} className="mr-1 inline" />{item.recipient_name}</td>
                <td className="max-w-48 truncate px-5 py-3 text-slate-600" title={item.purpose}>{item.purpose}</td>
                <td className="px-5 py-3 text-right font-mono font-semibold text-slate-800">{formatXAF(item.amount_xaf, lang)}</td>
                <td className="px-5 py-3"><StatusChip status={item.case_status} lang={lang} /></td>
                <td className="px-5 py-3 text-right"><Link to={`/cases/${item.case_uid}`} className="text-emerald-700 hover:underline"><ArrowRight size={16} /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-slate-100 md:hidden">
        {items.map((item) => (
          <Link key={item.id} to={`/cases/${item.case_uid}`} className="block space-y-2 px-4 py-4 hover:bg-slate-50">
            <div className="flex items-start justify-between gap-3"><div><div className="font-medium text-slate-900">{item.claimant_name}</div><div className="font-mono text-xs text-slate-400">{item.case_uid.slice(0, 8)}…</div></div><StatusChip status={item.case_status} lang={lang} /></div>
            <div className="flex justify-between gap-3 text-xs text-slate-500"><span>{item.payment_date} · {item.recipient_name}</span><strong className="text-slate-800">{formatXAF(item.amount_xaf, lang)}</strong></div>
          </Link>
        ))}
      </div>
    </>
  );
}