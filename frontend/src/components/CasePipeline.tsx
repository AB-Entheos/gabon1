import type { Case } from "@/api/hecApi";
import { useTranslation } from "react-i18next";
import type { Language } from "@/store/authSlice";
import { Check, AlertTriangle } from "lucide-react";

/*
 * Approval pipeline:
 *   1. CB → 2. AB Entheos → 3. WCS → 4. DGFC → 5. DGFAP final approval
 */
const STEPS_5 = [
  { n: 1, key: "step_cb" },
  { n: 2, key: "step_ab" },
  { n: 3, key: "step_wcs" },
  { n: 4, key: "step_dgfc" },
  { n: 5, key: "step_dgfap" },
] as const;

type VisualState = "done" | "current" | "future" | "rejected";

function visualStateFor6(step: number, c: Case): VisualState {
  if (c.status === "CLOSED" || c.status === "APPROVED") return "done";
  if (c.status === "REJECTED") {
    if (step < c.current_step) return "done";
    if (step === c.current_step) return "rejected";
    return "future";
  }
  if (c.status === "AT_APPROVAL") {
    if (step < c.current_step) return "done";
    if (step === c.current_step) return "current";
    return "future";
  }
  return "future";
}

export default function CasePipeline({
  caseData,
  lang: _lang,
}: {
  caseData: Case;
  lang: Language;
}) {
  const { t } = useTranslation();
  const STEPS = STEPS_5;
  const inApproval = caseData.status === "AT_APPROVAL";
  const rejectedStep = caseData.status === "REJECTED" ? caseData.current_step : null;
  const current = inApproval ? caseData.current_step : rejectedStep;
  const totalSteps = STEPS.length;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t("pipeline.title", "Approval pipeline")}</h2>
        <span className="text-xs text-slate-500 hidden sm:inline">
          {caseData.status === "CLOSED"
            ? t("pipeline.status.closed", `Closed · all ${totalSteps} steps complete`).replace("{n}", String(totalSteps))
            : caseData.status === "APPROVED"
              ? t("pipeline.status.approved", "Approved")
              : caseData.status === "REJECTED"
                ? t("pipeline.status.rejected", "Rejected at step {step}")
                    .replace("{step}", String(current ?? "?"))
                : current !== null
                  ? t("pipeline.step_of", "Step {step} of {total}").replace("{step}", String(current)).replace("{total}", String(totalSteps))
                  : "—"}
        </span>
      </div>
      <div className="overflow-x-auto">
      <ol className="flex items-start gap-0 min-w-[480px] sm:min-w-0">
        {STEPS.map((s, i) => {
          const v = visualStateFor6(s.n, caseData);
          const isLast = i === STEPS.length - 1;
          const prevDone = i === 0 || visualStateFor6(STEPS[i - 1].n, caseData) === "done";
          const circleCls =
            v === "done"
              ? "bg-emerald-600 text-white ring-emerald-600"
              : v === "current"
                ? "bg-yellow-400 text-slate-900 ring-yellow-400 ring-4 ring-yellow-100"
                : v === "rejected"
                  ? "bg-rose-500 text-white ring-rose-500 ring-4 ring-rose-100"
                  : "bg-slate-200 text-slate-500 ring-slate-200";
          const labelCls =
            v === "done"
              ? "text-emerald-700 font-semibold"
              : v === "current"
                ? "text-slate-900 font-bold"
                : v === "rejected"
                  ? "text-rose-700 font-semibold"
                  : "text-slate-400";
          const lineCls = v === "done" || (isLast ? false : prevDone && visualStateFor6(STEPS[i + 1].n, caseData) !== "future")
            ? "bg-emerald-600"
            : "bg-slate-200";
          return (
            <li key={s.n} className="flex flex-1 items-start">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`grid h-9 w-9 place-items-center rounded-full text-sm ring-2 ${circleCls}`}>
                  {v === "done" ? <Check size={16} /> : v === "rejected" ? <AlertTriangle size={16} /> : s.n}
                </div>
                <div className={`text-center text-[11px] ${labelCls}`}>
                  {t(`pipeline.${s.key}`, s.key)}
                </div>
                <div className={`text-center text-[10px] uppercase tracking-wider ${
                  v === "done" ? "text-emerald-600" :
                  v === "current" ? "text-yellow-700" :
                  v === "rejected" ? "text-rose-600" :
                  "text-slate-400"
                }`}>
                  {v === "done" && t("pipeline.state.done", "done")}
                  {v === "current" && t("pipeline.state.current", "in review")}
                  {v === "rejected" && t("pipeline.state.rejected", "rejected")}
                  {v === "future" && t("pipeline.state.future", "pending")}
                </div>
              </div>
              {!isLast && (
                <div className={`mt-[18px] h-0.5 flex-1 rounded ${lineCls}`} aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
      </div>
    </div>
  );
}
