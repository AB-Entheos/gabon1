import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { Layers, FilePlus, CheckCircle2, XCircle, Banknote } from "lucide-react";
import { useGetStagesQuery } from "@/api/stageApi";
import { useListCasesQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip } from "@/components/StatusChip";

/*
 * 6-step pipeline (default for all roles):
 *   1. CB → 2. AB Entheos → 3. WCS → 4. DGFC → 5. DGFAP → 6. Minister
 *
 * 3-step pipeline (minister only):
 *   1. CB → 2. Technical team (AB · WCS · DGFC · DGFAP) → 3. Minister
 */
const STAGE_META_6: Record<number, { key: string; role: string; color: string; bg: string; border: string; sub: string }> = {
  1: { key: "stage_cb",     role: "CB",      color: "text-emerald-700",  bg: "bg-emerald-50",  border: "border-emerald-200", sub: "" },
  2: { key: "stage_ab",     role: "AB",      color: "text-sky-700",      bg: "bg-sky-50",      border: "border-sky-200",     sub: "" },
  3: { key: "stage_wcs",    role: "WCS",     color: "text-amber-700",    bg: "bg-amber-50",    border: "border-amber-200",   sub: "" },
  4: { key: "stage_dgfc",   role: "DGFC",    color: "text-indigo-700",   bg: "bg-indigo-50",   border: "border-indigo-200",  sub: "" },
  5: { key: "stage_dgfap",  role: "DGFAP",   color: "text-yellow-700",   bg: "bg-yellow-50",   border: "border-yellow-300",  sub: "" },
  6: { key: "stage_minister", role: "MINISTER", color: "text-rose-700",  bg: "bg-rose-50",     border: "border-rose-200",    sub: "" },
};

const STAGE_META_3: Record<number, { key: string; role: string; color: string; bg: string; border: string; sub: string }> = {
  1: { key: "stage_cb",         role: "CB",          color: "text-emerald-700",  bg: "bg-emerald-50",  border: "border-emerald-200", sub: "" },
  2: { key: "stage_technical",   role: "TECHNICAL",   color: "text-sky-700",      bg: "bg-sky-50",      border: "border-sky-200",     sub: "AB Entheos · WCS · DGFC · DGFAP" },
  3: { key: "stage_minister",    role: "MINISTER",    color: "text-rose-700",     bg: "bg-rose-50",     border: "border-rose-200",    sub: "" },
};

/** Map backend step → visual group (1, 2, or 3) for minister. */
function backendToVisual(step: number): number {
  if (step <= 1) return 1;
  if (step <= 5) return 2;
  return 3;
}

export default function StageDashboard() {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);
  const { data: stages, isLoading } = useGetStagesQuery();
  const { data: cases } = useListCasesQuery();

  const totalActive = (stages?.drafts ?? 0) + (stages?.submitted ?? 0) + (stages?.verified ?? 0)
    + Object.values(stages?.by_step ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-slate-500">
            <Layers size={14} />
            {t("nav.dashboard", "Dashboard")}
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">
            {t("dash.stages.title", "Approval committee overview")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {t("dash.stages.subtitle", "Live counts per approval stage. Click a stage to see its queue.")}
          </p>
        </div>
        {user?.role === "CB" && (
          <Link to="/cases/new" className="btn-primary">
            <FilePlus size={16} />
            {t("dash.stages.new_case", "New case")}
          </Link>
        )}
      </header>

      {/* Top KPI strip */}
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <KpiCard label={t("dash.stages.active", "Active")} value={totalActive} color="primary" />
        <KpiCard label={t("dash.stages.drafts", "Drafts")} value={stages?.drafts ?? 0} color="slate" />
        <KpiCard label={t("dash.stages.submitted", "Submitted")} value={stages?.submitted ?? 0} color="sky" />
        <KpiCard label={t("dash.stages.verified", "Verified")} value={stages?.verified ?? 0} color="sky" />
        <KpiCard label={t("dash.stages.first_aid", "Accelerated benefit")} value={stages?.accelerated_benefit_released ?? 0} color="yellow" />
        <KpiCard label={t("dash.stages.approved", "Approved")} value={stages?.approved ?? 0} color="green" />
      </section>

      {/* Stage funnel */}
      <section>
        <h2 className="mb-3 text-base font-semibold text-slate-900">
          {t("dash.stages.funnel", "Approval funnel")}
        </h2>
        {(() => {
          const isMinister = user?.role === "MINISTER";
          const STAGE_META = isMinister ? STAGE_META_3 : STAGE_META_6;
          const steps = isMinister ? [1, 2, 3] : [2, 3, 4, 5, 6];
          const gridCols = isMinister ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-5";
          return (
            <div className={`grid grid-cols-1 gap-3 ${gridCols}`}>
              {steps.map((step) => {
                const meta = STAGE_META[step];
                const count = isMinister
                  ? step === 2
                    ? [2, 3, 4, 5].reduce((sum, bs) => sum + (stages?.by_step?.[String(bs) as "2" | "3" | "4" | "5"] ?? 0), 0)
                    : step === 3
                      ? (stages?.by_step?.["6"] ?? 0)
                      : (stages?.verified ?? 0) + (stages?.submitted ?? 0) + (stages?.drafts ?? 0)
                  : (stages?.by_step?.[String(step) as "2" | "3" | "4" | "5" | "6"] ?? 0);
                const isMine = isMinister
                  ? user?.role === meta.role || (step === 2 && ["AB", "WCS", "DGFC", "DGFAP"].includes(user?.role ?? ""))
                  : user?.role === meta.role;
                const queued = isMinister
                  ? (cases?.results ?? []).filter(
                      (c) => c.status === "AT_APPROVAL" && backendToVisual(c.current_step) === step
                    )
                  : (cases?.results ?? []).filter(
                      (c) => c.status === "AT_APPROVAL" && c.current_step === step
                    );
                return (
                  <Link
                    key={step}
                    to={queued.length > 0 ? `/cases/${queued[0].uid}` : "/cases"}
                    className={`group rounded-xl border ${meta.border} ${meta.bg} p-4 transition-shadow hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`grid h-9 w-9 place-items-center rounded-full bg-white ${meta.color} text-sm font-bold shadow-sm`}>
                          {step}
                        </div>
                        <div>
                          <div className={`text-xs font-semibold uppercase tracking-wide ${meta.color}`}>
                            {t(`pipeline.${meta.key}`, meta.role)}
                          </div>
                          <div className="text-[10px] text-slate-500">{meta.sub || meta.role}</div>
                        </div>
                      </div>
                      {isMine && (
                        <span className="chip bg-emerald-100 text-emerald-700">YOU</span>
                      )}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <div>
                        <div className={`text-3xl font-extrabold ${meta.color}`}>
                          {isLoading ? "…" : count}
                        </div>
                        <div className="text-xs text-slate-500">
                          {count === 1 ? t("dash.stages.case", "case") : t("dash.stages.cases", "cases")}
                        </div>
                      </div>
                      {count > 0 && (
                        <div className="text-xs text-slate-500 group-hover:text-slate-700">
                          {t("dash.stages.view_queue", "View queue →")}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Terminal states strip */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <TerminalCard
          icon={<CheckCircle2 className="text-emerald-600" size={20} />}
          label={t("dash.stages.closed", "Closed")}
          value={stages?.closed ?? 0}
          tone="border-emerald-200 bg-emerald-50"
        />
        <TerminalCard
          icon={<Banknote className="text-yellow-600" size={20} />}
          label={t("dash.stages.approved", "Approved (awaiting payment)")}
          value={stages?.approved ?? 0}
          tone="border-yellow-300 bg-yellow-50"
        />
        <TerminalCard
          icon={<XCircle className="text-rose-600" size={20} />}
          label={t("dash.stages.rejected", "Rejected")}
          value={stages?.rejected ?? 0}
          tone="border-rose-200 bg-rose-50"
        />
      </section>

      {/* Recent activity for the current user */}
      {user && (user.role === "ADMIN" || user.role === "SUPER_ADMIN") && (
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-900">
            {t("dash.stages.recent", "Most recent cases")}
          </h2>
          <RecentCasesTable />
        </section>
      )}
    </div>
  );
}

function KpiCard({
  label, value, color,
}: { label: string; value: number; color: "primary" | "slate" | "sky" | "yellow" | "green" }) {
  const palette: Record<string, string> = {
    primary: "bg-emerald-50 text-emerald-700 border-emerald-200",
    slate:   "bg-slate-50 text-slate-700 border-slate-200",
    sky:     "bg-sky-50 text-sky-700 border-sky-200",
    yellow:  "bg-yellow-50 text-yellow-700 border-yellow-300",
    green:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return (
    <div className={`rounded-xl border bg-white p-4`}>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 flex items-end justify-between">
        <div className="text-3xl font-extrabold text-slate-900">{value}</div>
        <span className={`chip border ${palette[color]}`}>{color}</span>
      </div>
    </div>
  );
}

function TerminalCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className={`rounded-xl border bg-white p-4`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <div className="text-sm font-semibold text-slate-700">{label}</div>
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{value}</div>
      </div>
      <div className={`mt-2 h-1 w-full rounded-full ${tone}`} />
    </div>
  );
}

function RecentCasesTable() {
  const { data } = useListCasesQuery();
  const lang = useSelector((s: RootState) => s.auth.language);
  if (!data) return null;
  const recent = [...data.results]
    .sort((a, b) => (b.reported_at > a.reported_at ? 1 : -1))
    .slice(0, 8);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">UID</th>
            <th className="px-4 py-3">Claimant</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Step</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((c) => (
            <tr key={c.uid} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-4 py-2 font-mono text-xs text-slate-500">
                <Link to={`/cases/${c.uid}`} className="text-emerald-700 hover:underline">
                  {c.uid.slice(0, 8)}…
                </Link>
              </td>
              <td className="px-4 py-2 font-medium text-slate-900">{c.claimant_name}</td>
              <td className="px-4 py-2 text-slate-500">{c.case_type}</td>
              <td className="px-4 py-2 text-slate-500">Step {c.current_step}</td>
              <td className="px-4 py-2"><StatusChip status={c.status} lang={lang} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
