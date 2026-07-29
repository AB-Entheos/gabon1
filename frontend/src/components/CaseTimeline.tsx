import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FilePlus,
  CheckCircle2,
  Send,
  CircleDollarSign,
  HeartPulse,
  ThumbsUp,
  XCircle,
  Lock,
  MessageSquare,
  ArrowRight,
  Activity,
  RotateCcw,
} from "lucide-react";
import { RoleBadge } from "@/components/StatusChip";
import { formatDateTime, formatXAF } from "@/api/format";
import type { Language } from "@/store/authSlice";

interface TimelineEvent {
  id: number;
  actor_email: string;
  actor_role: string;
  event_type: string;
  occurred_at: string;
  from_step: number | null;
  to_step: number | null;
  notes: string;
  amount_xaf?: string | null;
}

interface Props {
  events: TimelineEvent[];
  lang: Language;
  caseType?: string;
  amountProposed?: string | null;
  amountAuthorized?: string | null;
}

const ICON_MAP: Record<string, { icon: typeof FilePlus; tone: string; ring: string }> = {
  CREATED:             { icon: FilePlus,        tone: "text-slate-700 bg-slate-100",          ring: "ring-slate-200" },
  SUBMITTED:           { icon: Send,            tone: "text-blue-700 bg-blue-100",            ring: "ring-blue-200" },
  VERIFIED:            { icon: CheckCircle2,    tone: "text-cyan-700 bg-cyan-100",            ring: "ring-cyan-200" },
  ADVANCED:            { icon: ArrowRight,      tone: "text-emerald-700 bg-emerald-100",      ring: "ring-emerald-200" },
  REJECTED:            { icon: XCircle,         tone: "text-rose-700 bg-rose-100",             ring: "ring-rose-200" },
  DEFERRED:            { icon: RotateCcw,       tone: "text-amber-700 bg-amber-100",          ring: "ring-amber-200" },
  AMOUNT_SET:          { icon: CircleDollarSign,tone: "text-amber-700 bg-amber-100",           ring: "ring-amber-200" },
  AMOUNT_PROPOSED:     { icon: CircleDollarSign,tone: "text-amber-700 bg-amber-100",           ring: "ring-amber-200" },
  AMOUNT_AUTHORIZED:   { icon: CircleDollarSign,tone: "text-emerald-700 bg-emerald-100",       ring: "ring-emerald-200" },
  FIRST_AID_RELEASED:  { icon: HeartPulse,      tone: "text-yellow-700 bg-yellow-100",         ring: "ring-yellow-200" },
  APPROVED:            { icon: ThumbsUp,        tone: "text-emerald-700 bg-emerald-100",       ring: "ring-emerald-200" },
  CLOSED:              { icon: Lock,            tone: "text-slate-700 bg-slate-200",           ring: "ring-slate-300" },
  COMMENT:             { icon: MessageSquare,   tone: "text-slate-700 bg-slate-100",           ring: "ring-slate-200" },
};

function groupEventsByDay(events: TimelineEvent[]): [string, TimelineEvent[]][] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const k = e.occurred_at.slice(0, 10);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(e);
  }
  return Array.from(map.entries());
}

function dayLabel(key: string, lang: Language): string {
  // Use Intl with explicit timezone so SSR/CSR match.
  const d = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

export default function CaseTimeline({ events, lang, amountProposed, amountAuthorized }: Props) {
  const { t } = useTranslation();

  // Find the latest AMOUNT_PROPOSED amount for this case (to show in AMOUNT_AUTHORIZED cards).
  // Fall back to the case-level amountProposed when events lack amount_xaf.
  const dgfcProposedAmount = useMemo(() => {
    const proposed = [...events]
      .filter(e => e.event_type === "AMOUNT_PROPOSED" && e.amount_xaf)
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
    return proposed[0]?.amount_xaf ?? amountProposed ?? null;
  }, [events, amountProposed]);

  // Newest first; exclude CREATED — the header already shows creation time.
  const sorted = useMemo(() => {
    if (!Array.isArray(events)) return [];
    return [...events]
      .filter((e) => e.event_type !== "CREATED")
      .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
  }, [events]);

  // Dedupe noisy duplicate activity rows. A role is only ever allowed to act
  // once per (event_type, from_step → to_step). We keep the latest occurrence.
  // Comments are always shown (each is its own thought).
  const deduped = useMemo(() => {
    const seen = new Set<string>();
    const out: TimelineEvent[] = [];
    for (const e of sorted) {
      if (e.event_type === "COMMENT") {
        out.push(e);
        continue;
      }
      const key = `${e.actor_role}|${e.event_type}|${e.from_step ?? "-"}|${e.to_step ?? "-"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(e);
    }
    return out;
  }, [sorted]);

  // Group by day.
  const _groups = useMemo(() => groupEventsByDay(deduped), [deduped]);
  void _groups;

  if (deduped.length === 0) {
    return (
      <section className="card p-5">
        <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Activity size={16} className="text-slate-400" />
          {t("case.timeline.title", "Activity")}
        </div>
        <p className="mt-3 text-sm text-slate-500">{t("case.timeline.empty", "No activity yet.")}</p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Activity size={16} className="text-slate-400" />
          {t("case.timeline.title", "Activity")}
        </div>
        <span className="text-xs text-slate-500">
          {t("case.timeline.count", "{n} events").replace("{n}", String(deduped.length))}
        </span>
      </div>

      <ol className="mt-5 space-y-6">
        {groupEventsByDay(deduped).map(([day, items]) => (
          <li key={day}>
            <div className="mb-2 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {dayLabel(day, lang)}
              </span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <ul className="relative ml-3 space-y-4 border-l-2 border-slate-200 pl-6">
              {items.map((e) => {
                const meta = ICON_MAP[e.event_type] ?? ICON_MAP.COMMENT;
                const Icon = meta.icon;
                const label = t(`case.timeline.event.${e.event_type}`, e.event_type);
                const stepNote =
                  e.from_step != null && e.to_step != null && e.from_step !== e.to_step
                    ? t("case.timeline.step_change", "step {from} → {to}")
                        .replace("{from}", String(e.from_step))
                        .replace("{to}", String(e.to_step))
                    : e.to_step != null
                      ? t("case.timeline.at_step", "step {step}").replace("{step}", String(e.to_step))
                      : null;
                return (
                  <li key={e.id} className="relative">
                    <span className={`absolute -left-[33px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-white ${meta.tone}`}>
                      <Icon size={14} />
                    </span>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{label}</span>
                        {stepNote && (
                          <span className="chip bg-slate-100 text-slate-700">{stepNote}</span>
                        )}
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                        <RoleBadge role={e.actor_role} />
                        <span className="font-medium text-slate-700">{e.actor_email}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{formatDateTime(e.occurred_at, lang)}</span>
                      </div>
                      {e.event_type === "AMOUNT_PROPOSED" && (e.amount_xaf || amountProposed) && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                            {t("case.timeline.dgfc_proposed_amount", "DGFC Proposed Amount")}
                          </div>
                          <div className="mt-0.5 text-base font-bold text-amber-900">
                            {formatXAF(Number(e.amount_xaf || amountProposed), lang)}
                          </div>
                        </div>
                      )}
                      {e.event_type === "AMOUNT_AUTHORIZED" && (e.amount_xaf || amountAuthorized) && (
                        <div className="mt-2 space-y-2">
                          {dgfcProposedAmount && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                                {t("case.timeline.dgfc_proposed_amount", "DGFC Proposed Amount")}
                              </div>
                              <div className="mt-0.5 text-base font-bold text-amber-900">
                                {formatXAF(Number(dgfcProposedAmount), lang)}
                              </div>
                            </div>
                          )}
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                              {t("case.timeline.dgfap_authorized_amount", "DGFAP Authorized Amount")}
                            </div>
                            <div className="mt-0.5 text-base font-bold text-emerald-900">
                              {formatXAF(Number(e.amount_xaf || amountAuthorized), lang)}
                            </div>
                          </div>
                        </div>
                      )}
                      {e.notes && (
                        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{e.notes}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
