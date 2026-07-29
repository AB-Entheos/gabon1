import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Inbox, CheckCircle2, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useListCasesQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip } from "@/components/StatusChip";
import { formatDate, formatXAF } from "@/api/format";
import type { Case } from "@/api/hecApi";

export default function ApproverDashboard({
  step,
  title,
  subtitle,
}: {
  step: 2 | 3 | 4 | 6;
  title: string;
  subtitle: string;
}) {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const { data, isLoading } = useListCasesQuery();
  const queue = (data?.results ?? []).filter(
    (c) => c.status === "AT_APPROVAL" && c.current_step === step
  );
  const closed = (data?.results ?? []).filter(
    (c) => c.status === "CLOSED" || c.status === "APPROVED"
  );
  const [showClosed, setShowClosed] = useState(false);

  return (
    <div className="space-y-6">
      <header>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {t("nav.queue")}
        </div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>

      <section className="card p-0">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">
            <Inbox size={16} className="mr-2 inline text-slate-400" />
            {t("dash.queue.title", "My queue")} · <span className="font-bold text-emerald-700">{queue.length}</span>
          </h2>
        </div>
        {isLoading && <div className="p-5 text-slate-500">{t("common.loading", "Loading…")}</div>}
        {queue.length === 0 && (
          <div className="p-10 text-center text-slate-500">
            {t("dash.queue.empty", "No cases at your step right now.")}
          </div>
        )}
        {queue.length > 0 && <QueueTable cases={queue} lang={lang} />}
      </section>

      {closed.length > 0 && (
        <section className="card p-0">
          <button
            type="button"
            onClick={() => setShowClosed(!showClosed)}
            className="flex w-full items-center justify-between border-b border-slate-200 px-5 py-3 text-left hover:bg-slate-50"
          >
            <h2 className="text-base font-semibold text-slate-900">
              <CheckCircle2 size={16} className="mr-2 inline text-emerald-500" />
              {t("dash.paid.title", "Paid claims")} · <span className="font-bold text-emerald-700">{closed.length}</span>
            </h2>
            {showClosed ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
          </button>
          {showClosed && <ClosedTable cases={closed} lang={lang} />}
        </section>
      )}
    </div>
  );
}

function QueueTable({ cases, lang }: { cases: Case[]; lang: "en" | "fr" }) {
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
              <th className="px-5 py-3">{t("table.sla", "SLA")}</th>
              <th className="px-5 py-3">{t("table.status", "Status")}</th>
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
                <td className="px-5 py-3 text-slate-500">{formatDate(c.incident_at, lang)}</td>
                <td className="px-5 py-3 text-slate-500">{formatDate(c.sla_deadline, lang)}</td>
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
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{t("table.incident", "Incident")}: {formatDate(c.incident_at, lang)}</span>
                  <span>{t("table.sla", "SLA")}: {formatDate(c.sla_deadline, lang)}</span>
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

function ClosedTable({ cases, lang }: { cases: Case[]; lang: "en" | "fr" }) {
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
              <th className="px-5 py-3 text-right">{t("table.amount", "Amount")}</th>
              <th className="px-5 py-3">{t("table.status", "Status")}</th>
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
                <td className="px-5 py-3 text-slate-500">{formatDate(c.incident_at, lang)}</td>
                <td className="px-5 py-3 text-right font-mono text-sm text-emerald-700">
                  {(c as any).amount_authorized ? formatXAF(Number((c as any).amount_authorized), lang) : "—"}
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
                <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500">
                  <span>{t("table.incident", "Incident")}: {formatDate(c.incident_at, lang)}</span>
                  {(c as any).amount_authorized && (
                    <span className="font-semibold text-emerald-700">{formatXAF(Number((c as any).amount_authorized), lang)}</span>
                  )}
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
