import type { Case } from "@/api/hecApi";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import type { Language } from "@/store/authSlice";
import type { RootState } from "@/store";
import { Check, AlertTriangle } from "lucide-react";

/*
 * 6-step pipeline (default for all roles):
 *   1. CB → 2. AB Entheos → 3. WCS → 4. DGFC → 5. DGFAP → 6. Minister
 *
 * 3-step pipeline (minister only):
 *   1. CB → 2. Technical team (AB · WCS · DGFC · DGFAP) → 3. Minister
 */
const STEPS_6 = [
  { n: 1, key: "step_cb" },
  { n: 2, key: "step_ab" },
  { n: 3, key: "step_wcs" },
  { n: 4, key: "step_dgfc" },
  { n: 5, key: "step_dgfap" },
  { n: 6, key: "step_minister" },
] as const;

const STEPS_3 = [
  { n: 1, key: "step_cb",         sub: "" },
  { n: 2, key: "step_technical",  sub: "AB Entheos · WCS · DGFC · DGFAP" },
  { n: 3, key: "step_minister",   sub: "" },
] as const;

type VisualState = "done" | "current" | "future" | "rejected";

/** Map the backend's 6 internal steps to the 3 visual steps (minister only). */
function backendToVisual(backendStep: number): number {
  if (backendStep <= 1) return 1;
  if (backendStep <= 5) return 2;
  return 3;
}

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

function visualStateFor3(visualStep: number, c: Case): VisualState {
  if (c.status === "CLOSED" || c.status === "APPROVED") return "done";
  const vCurrent = backendToVisual(c.current_step);
  if (c.status === "REJECTED") {
    if (visualStep < vCurrent) return "done";
    if (visualStep === vCurrent) return "rejected";
    return "future";
  }
  if (c.status === "AT_APPROVAL") {
    if (visualStep < vCurrent) return "done";
    if (visualStep === vCurrent) return "current";
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
  const user = useSelector((s: RootState) => s.auth.user);
  const isMinister = user?.role === "MINISTER";
  const STEPS = isMinister ? STEPS_3 : STEPS_6;
  const inApproval = caseData.status === "AT_APPROVAL";
  const rejectedStep = caseData.status === "REJECTED" ? caseData.current_step : null;
  const current = inApproval ? caseData.current_step : rejectedStep;
  const totalSteps = STEPS.length;

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">{t("pipeline.title", "Approval pipeline")}</h2>
        <span className="text-xs text-slate-500">
          {caseData.status === "CLOSED"
            ? t("pipeline.status.closed", `Closed · all ${totalSteps} steps complete`).replace("{n}", String(totalSteps))
            : caseData.status === "APPROVED"
              ? t("pipeline.status.approved", "Approved")
              : caseData.status === "REJECTED"
                ? t("pipeline.status.rejected", "Rejected at step {step}")
                    .replace("{step}", String(current ?? "?"))
                : current !== null
                  ? t("pipeline.step_of", "Step {step} of {total}").replace("{step}", String(isMinister ? backendToVisual(current) : current)).replace("{total}", String(totalSteps))
                  : "—"}
        </span>
      </div>
      <ol className="flex items-start gap-0">
        {STEPS.map((s, i) => {
          const v = isMinister ? visualStateFor3(s.n, caseData) : visualStateFor6(s.n, caseData);
          const isLast = i === STEPS.length - 1;
          const prevDone = i === 0 || (isMinister ? visualStateFor3(STEPS[i - 1].n, caseData) : visualStateFor6(STEPS[i - 1].n, caseData)) === "done";
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
          const lineCls = v === "done" || (isLast ? false : prevDone && (isMinister ? visualStateFor3(STEPS[i + 1].n, caseData) : visualStateFor6(STEPS[i + 1].n, caseData)) !== "future")
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
                  {"sub" in s && s.sub && <div className="text-[9px] font-normal opacity-70">{s.sub}</div>}
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
  );
}
