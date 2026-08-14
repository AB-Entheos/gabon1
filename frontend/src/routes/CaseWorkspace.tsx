import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { ArrowLeft, CheckCircle2, XCircle, ShieldAlert, RotateCcw, AlertTriangle, ClipboardCheck, CircleDollarSign, Loader2, Trash2, Send } from "lucide-react";
import {
  useGetCaseQuery,
  useVerifyCaseMutation,
  useAdvanceCaseMutation,
  useRejectCaseMutation,
  useDeferCaseMutation,
  useResumeCaseMutation,
  useSetAmountMutation,
  useSubmitCaseMutation,
  useResendCaseStageEmailMutation,
  useGetFormQuery,
  useSubmitFormMutation,
  useDeleteCaseMutation,
  closeCase,
} from "@/api/hecApi";
import type { RootState } from "@/store";
import { StatusChip, RoleBadge } from "@/components/StatusChip";
import { formatDateTime, formatXAF } from "@/api/format";
import CasePipeline from "@/components/CasePipeline";
import CaseTimeline from "@/components/CaseTimeline";
import FormRenderer from "@/components/FormRenderer";
import FileUploader from "@/components/FileUploader";
import EvidenceGallery from "@/components/EvidenceGallery";
import CaseFileChecklist from "@/components/CaseFileChecklist";
import DisbursementHistory from "@/components/DisbursementHistory";

export default function CaseWorkspace() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const user = useSelector((s: RootState) => s.auth.user);
  const { data: caseData, isLoading, refetch } = useGetCaseQuery(uid!, { skip: !uid, refetchOnMountOrArgChange: true });
  const { data: cbForm } = useGetFormQuery("cb-incident-report", { skip: !uid });
  const [submitForm, { isLoading: submittingForm }] = useSubmitFormMutation();

  const fmt = (n: number) => n.toLocaleString("fr-FR");

  const [verifyCase] = useVerifyCaseMutation();
  const [advance] = useAdvanceCaseMutation();
  const [reject] = useRejectCaseMutation();
  const [deferCase] = useDeferCaseMutation();
  const [resumeCase] = useResumeCaseMutation();
  const [setAmount] = useSetAmountMutation();
  const [submitCase] = useSubmitCaseMutation();
  const [resendCaseStageEmail, { isLoading: resendingEmail }] = useResendCaseStageEmailMutation();
  const [deleteCaseMutation] = useDeleteCaseMutation();
  const [progressiveMissingSlots, setProgressiveMissingSlots] = useState<string[] | null>(null);
  const [, setProgressiveWarning] = useState<string | null>(null);

  if (isLoading) return <div className="p-6 text-slate-500">{t("common.loading")}</div>;
  if (!caseData) return <div className="p-6 text-rose-600">{t("case.not_found", "Case not found.")}</div>;

  const isCB = caseData.created_by === user?.id;
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const isDeleted = caseData.status === "DELETED";
  const isCurrentApprover =
    caseData.status === "AT_APPROVAL" &&
    (caseData.current_approver_role === user?.role || isAdmin);
  const isAssignedReviewer =
    caseData.status === "AT_APPROVAL" && caseData.current_approver_role === user?.role;

  async function onSubmitForm(payload: Record<string, unknown>) {
    if (!cbForm || !uid) return;
    await submitForm({ slug: cbForm.slug, version: cbForm.version, case_uid: uid, payload }).unwrap();
    void refetch();
  }

  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700">
              <ArrowLeft size={12} /> {t("common.back", "Back")}
            </Link>
            <h1 className="mt-2 text-2xl font-bold text-slate-900">{caseData.claimant_name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <span className="font-mono text-xs text-slate-400">{caseData.uid}</span>
              <span>·</span>
              <span className="chip bg-blue-100 text-blue-700">{caseData.case_type}</span>
              <span>·</span>
              <span>{formatDateTime(caseData.reported_at, lang)}</span>
            </div>
          </div>
          <div className="text-right">
            <StatusChip status={caseData.status} lang={lang} />
          </div>
        </div>
      </div>

      <CasePipeline caseData={caseData} lang={lang} />

      {isSuperAdmin && (
        <ManualEmailResend
          caseUid={caseData.uid}
          busy={resendingEmail}
          onResend={async (stage) => {
            const result = await resendCaseStageEmail({ uid: caseData.uid, stage }).unwrap();
            window.alert(`${result.sent} email(s) sent; ${result.failed} failed.`);
          }}
        />
      )}

      {isDeleted && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          {t("case.deleted_read_only", "This case is deleted and is visible only to superadmins. Its related records and attachments were preserved.")}
        </div>
      )}

      {/* KYC Details Section */}
      <div className="card p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">{t("case.kyc.title", "Claimant Details")}</h2>
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <DetailRow label={t("case.kyc.name", "Full name")} value={caseData.claimant_name} />
          <DetailRow label={t("case.kyc.phone", "Phone")} value={caseData.claimant_phone} />
          <DetailRow label={t("case.kyc.id_type", "ID type")} value={caseData.claimant_id_type} />
          <DetailRow label={t("case.kyc.id_number", "ID number")} value={caseData.claimant_id_number} />
          <DetailRow label={t("case.kyc.date_of_birth", "Date of birth")} value={caseData.claimant_date_of_birth} />
          <DetailRow label={t("case.kyc.gender", "Gender")} value={caseData.claimant_gender} />
          <DetailRow label={t("case.kyc.address", "Address")} value={caseData.claimant_address} />
          <DetailRow label={t("case.kyc.incident_location", "Incident location")} value={caseData.incident_location} />
          <DetailRow label={t("case.kyc.relationship", "Relationship")} value={caseData.relationship_to_claimant} />
          <DetailRow label={t("case.kyc.village", "Village")} value={caseData.village_name} />
          {caseData.village_name_text && (
            <DetailRow label={t("case.kyc.village_reported", "Village (reported)")} value={caseData.village_name_text} />
          )}
          {caseData.chef_de_village && (
            <DetailRow label={t("case.kyc.chef_de_village", "Chef de village")} value={caseData.chef_de_village} />
          )}
        </div>
      </div>

      {caseData.disbursement_summary?.approaching_limit && (
        <div
          className="flex items-start gap-3 rounded-xl border-2 border-rose-300 bg-rose-50 p-4 text-rose-900 shadow-sm"
          role="alert"
          data-testid="global-approaching-limit-banner"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <div className="text-sm font-semibold">
              {t(
                "case.disbursements.global_warning_title",
                "Disbursements approaching the authorized limit",
              )}
            </div>
            <div className="mt-1 text-xs">
              {t(
                "case.disbursement_warning",
                "{{disbursed}} of {{authorized}} FCFA disbursed ({{pct}}%). Plan remaining payments carefully.",
                {
                  disbursed: fmt(caseData.disbursement_summary.disbursed_xaf),
                  authorized: fmt(caseData.disbursement_summary.authorized_xaf),
                  pct: caseData.disbursement_summary.utilization_pct.toFixed(1),
                },
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {isCB && caseData.status === "DRAFT" && cbForm && (
            <section className="card p-5">
              <FormRenderer
                form={cbForm}
                caseUid={caseData.uid}
                lang={lang}
                submitting={submittingForm}
                onSubmit={onSubmitForm}
                initialValues={{
                  claimant_name: caseData.claimant_name,
                  claimant_phone: caseData.claimant_phone,
                  case_type: caseData.case_type,
                  incident_date: caseData.incident_at?.slice(0, 10),
                }}
                readOnlyFields={["claimant_name", "claimant_phone", "case_type", "incident_date"]}
              />
            </section>
          )}

          <div className="space-y-6">
            <EvidenceGallery caseUid={caseData.uid} lang={lang} />
            {progressiveMissingSlots && progressiveMissingSlots.length > 0 && (
              <div
                className="flex items-start justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900"
                data-testid="progressive-missing-slots-banner"
                role="status"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-sm font-semibold">
                      {t("case.files.progressive_warning_title", "Files can still be added")}
                    </p>
                    <p className="mt-1 text-xs">
                      {t(
                        "case.files.progressive_warning_body",
                        "This case was advanced with one or more required file slots still empty. They can be added by any approver at any later stage.",
                      )}
                    </p>
                    <p className="mt-1 text-xs font-medium">
                      {t(
                        "case.files.progressive_missing_slots",
                        "Missing required slots: {{slots}}",
                        { slots: progressiveMissingSlots.join(", ") },
                      )}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setProgressiveMissingSlots(null);
                    setProgressiveWarning(null);
                  }}
                  className="text-amber-600 hover:text-amber-800"
                  data-testid="dismiss-progressive-banner"
                >
                  ×
                </button>
              </div>
            )}
            <CaseFileChecklist caseUid={caseData.uid} caseType={caseData.case_type} lang={lang} />
            <DisbursementHistory caseUid={caseData.uid} />
            <div id="case-timeline">
              <CaseTimeline
                events={caseData.events}
                lang={lang}
                amountProposed={caseData.amount_proposed}
                amountAuthorized={caseData.amount_authorized}
              />
            </div>
          </div>

          {!isDeleted && <ActionPanel
            caseData={caseData}
            isCB={isCB}
            isCurrentApprover={isCurrentApprover}
            isAssignedReviewer={isAssignedReviewer}
            isAdmin={isAdmin}
            lang={lang}
            refetch={refetch}
            onVerify={async () => { await verifyCase(caseData.uid).unwrap(); void refetch(); }}
            onSubmit={async () => { await submitCase(caseData.uid).unwrap(); void refetch(); }}
            onAdvance={async (notes) => {
              const result = await advance({ uid: caseData.uid, notes }).unwrap();
              if (result.missing_required_slots && result.missing_required_slots.length > 0) {
                setProgressiveMissingSlots(result.missing_required_slots);
                setProgressiveWarning(
                  result.warning ??
                    "This case was advanced with one or more required file slots still empty.",
                );
                void refetch();
              } else {
                // Case moved to next step — navigate away since the current
                // approver may no longer have visibility.
                navigate("/stages");
              }
            }}
            onReject={async (notes) => { await reject({ uid: caseData.uid, notes }).unwrap(); void refetch(); }}
            onDefer={async (notes) => { await deferCase({ uid: caseData.uid, notes }).unwrap(); void refetch(); }}
            onResume={async (notes) => { await resumeCase({ uid: caseData.uid, notes }).unwrap(); void refetch(); }}
            onSetAmount={async (amount, reason) => {
              await setAmount({ uid: caseData.uid, amount_xaf: amount, reason }).unwrap();
              void refetch();
            }}
            onDelete={async () => {
              await deleteCaseMutation(caseData.uid).unwrap();
            }}
          />}
        </div>

        <aside className="space-y-6">
          <CaseMetadata caseData={caseData} lang={lang} />
          {!isDeleted && <FileUploader
            caseUid={caseData.uid}
            accept="image/*,application/pdf"
            capture="environment"
            label={t("case.upload_evidence", "Upload evidence (camera)")}
            showTypeInput={false}
            attachToCase
            showMetadataForm
            requireSubmit
          />}

        </aside>
      </div>
    </div>
  );
}

function ManualEmailResend({ busy, onResend }: { caseUid: string; busy: boolean; onResend: (stage: string) => Promise<void> }) {
  const { t } = useTranslation();
  const [stage, setStage] = useState("submitted");
  return (
    <div className="card border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <div className="text-sm font-semibold text-amber-900">{t("case.manual_email.title", "Manually resend case email")}</div>
          <div className="mt-1 text-xs text-amber-800">{t("case.manual_email.help", "Superadmin only. This sends the selected stage notification again to the configured recipients.")}</div>
        </div>
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="input min-w-56" disabled={busy}>
          <option value="created">Case created</option>
          <option value="submitted">Approval workflow initiated</option>
          <option value="verified">Case verified</option>
          <option value="advance_ab">AB forwarded</option>
          <option value="advance_wcs">WCS forwarded</option>
          <option value="amount_proposed">Amount proposed</option>
          <option value="advance_dgfc">DGFC forwarded</option>
          <option value="amount_authorized">Amount authorized</option>
          <option value="approved">Case approved</option>
          <option value="rejected">Case rejected</option>
          <option value="deferred">Case deferred</option>
          <option value="closed">Case closed</option>
        </select>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void onResend(stage)}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {busy ? t("common.sending", "Sending…") : t("case.manual_email.send", "Send email")}
        </button>
      </div>
    </div>
  );
}

function CaseMetadata({ caseData, lang }: { caseData: any; lang: "en" | "fr" }) {
  const { t } = useTranslation();
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-slate-900">{t("case.metadata", "Details")}</h3>
      <dl className="mt-3 space-y-2 text-sm">
        <Row label={t("case.phone", "Phone")} value={caseData.claimant_phone || "—"} mono />
        <Row label={t("case.village", "Village")} value={caseData.village_name || "—"} />
        <Row label={t("case.sla", "SLA")} value={formatDateTime(caseData.sla_deadline, lang)} mono />
        <Row
          label={t("case.amount", "Amount")}
          value={caseData.amount_authorized ? formatXAF(Number(caseData.amount_authorized), lang) : "—"}
          mono
          accent={caseData.amount_authorized ? "emerald" : undefined}
        />
        {caseData.amount_proposed && (
          <Row
            label={t("case.amount_proposed", "Proposed")}
            value={formatXAF(Number(caseData.amount_proposed), lang)}
            mono
            accent="yellow"
          />
        )}
        {caseData.disbursement_summary && (
          <>
            <Row
              label={t("case.disbursements.authorized", "Authorized")}
              value={formatXAF(Number(caseData.disbursement_summary.authorized_xaf), lang)}
              mono
            />
            <Row
              label={t("case.disbursements.disbursed", "Disbursed")}
              value={`${formatXAF(Number(caseData.disbursement_summary.disbursed_xaf), lang)} (${caseData.disbursement_summary.utilization_pct}%)`}
              mono
              accent={caseData.disbursement_summary.approaching_limit ? "yellow" : undefined}
            />
            <Row
              label={t("case.disbursements.remaining", "Remaining")}
              value={formatXAF(Number(caseData.disbursement_summary.remaining_xaf), lang)}
              mono
            />
          </>
        )}
        <Row label={t("case.created_by", "Created by")} value={caseData.created_by_email} />
        {caseData.current_approver_role && (
          <Row
            label={t("case.next_approver", "Next approver")}
            value={<RoleBadge role={caseData.current_approver_role} />}
          />
        )}
      </dl>
    </div>
  );
}

function Row({ label, value, mono, accent }: { label: string; value: React.ReactNode; mono?: boolean; accent?: "emerald" | "yellow" }) {
  const accentCls = accent === "emerald" ? "text-emerald-700" : accent === "yellow" ? "text-yellow-700" : "text-slate-700";
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""} ${accentCls}`}>{value}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</span>
      <div className="mt-0.5 text-sm text-slate-800">{value || "—"}</div>
    </div>
  );
}

const ROLE_FOR_STEP: Record<number, string> = {
  1: "CB / DP",
  2: "AB",
  3: "WCS",
  4: "DGFC",
  5: "DGFAP",
};

function ActionPanel({
  caseData, isCB, isCurrentApprover, isAssignedReviewer, isAdmin, lang, refetch,
  onVerify, onSubmit, onAdvance, onReject, onDefer, onResume, onSetAmount, onDelete,
}: {
  caseData: any; isCB: boolean; isCurrentApprover: boolean; isAssignedReviewer: boolean; isAdmin: boolean; lang: "en" | "fr";
  refetch: () => void;
  onVerify: () => Promise<void>;
  onSubmit: () => Promise<void>;
  onAdvance: (notes: string) => Promise<void>;
  onReject: (notes: string) => Promise<void>;
  onDefer: (notes: string) => Promise<void>;
  onResume: (notes: string) => Promise<void>;
  onSetAmount: (amount: number, reason: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);
  const [amount, setAmountValue] = useState("");
  const [reason, setReason] = useState("");
  const [deferOpen, setDeferOpen] = useState(false);
  const [deferNotes, setDeferNotes] = useState("");
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveSuccess, setApproveSuccess] = useState(false);
  const [approveNotes, setApproveNotes] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeComment, setCloseComment] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [amountSuccess, setAmountSuccess] = useState<string | null>(null);

  if (caseData.status === "DELETED") return null;

  const canDefer = isAssignedReviewer && caseData.current_step >= 3 && !isCB;
  const isDeferred = caseData.status === "DEFERRED";
  const canResume =
    isDeferred &&
    !!user &&
    (user.role === "ADMIN" ||
      user.role === "SUPER_ADMIN" ||
      caseData.current_approver_role === user.role ||
      (user.role === "CB" || user.role === "DP") && caseData.current_step === 1);

  async function wrap(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try {
      await fn();
    } catch (e: any) {
      // Extract error message from various DRF response shapes.
      const data = e?.data ?? e;
      let detail: string;
      if (typeof data === "string") {
        detail = data;
      } else if (data?.detail) {
        detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
      } else if (data && typeof data === "object") {
        // Flatten field-level errors like { amount_xaf: ["Must be > 0."] }
        const msgs = Object.entries(data)
          .flatMap(([k, v]) => {
            if (k === "non_field_errors" || k === "detail") return [];
            const vals = Array.isArray(v) ? v : [v];
            return vals.map((m: any) => typeof m === "string" ? `${k}: ${m}` : `${k}: ${JSON.stringify(m)}`);
          });
        detail = msgs.length ? msgs.join("; ") : JSON.stringify(data);
      } else {
        detail = String(e);
      }
      // Friendly rendering when the backend lists missing required file slots.
      const m = detail.match(/until all required file slots are completed:\s*(.+)$/i);
      if (m) {
        const slots = m[1].split(",").map((s: string) => s.trim()).filter(Boolean);
        setError(
          t(
            "case.error.missing_files",
            "Cannot advance: missing required files: {{slots}}",
            { slots: slots.join(", ") },
          ),
        );
      } else {
        setError(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  const lastDeferral = (() => {
    if (!isDeferred) return null;
    return [...caseData.events]
      .reverse()
      .find((e: any) => e.event_type === "DEFERRED") || null;
  })();

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("case.actions.title", "Actions")}</h2>
      {error && (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      <div className="mt-4 space-y-3">
        {isCurrentApprover && caseData.current_step !== 5 && caseData.current_step !== 4 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
              <ShieldAlert size={14} />
              {t("case.actions.yours", "Stage {step} is yours to advance").replace("{step}", String(caseData.current_step))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-primary flex-1"
                disabled={busy}
                onClick={() => { setApproveNotes(""); setApproveSuccess(false); setApproveOpen(true); }}
                data-testid="approve-button"
              >
                <CheckCircle2 size={16} />
                {t("common.advance", "Approve & advance")}
              </button>
              {isAssignedReviewer && user?.role !== "MINISTER" && (
                <button
                  className="btn-danger"
                  disabled={busy}
                  onClick={() => { setRejectNotes(""); setRejectOpen(true); }}
                  data-testid="reject-button"
                >
                  <XCircle size={16} />
                  {t("common.reject", "Reject")}
                </button>
              )}
              {canDefer && (
                <button className="btn-secondary" disabled={busy} onClick={() => setDeferOpen(true)}>
                  <RotateCcw size={16} />
                  {t("common.defer", "Defer")}
                </button>
              )}
            </div>
          </div>
        )}

        {isCurrentApprover && caseData.current_step === 4 && (
          <div className="space-y-3 rounded-lg border-2 border-blue-300 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-700">
              <ShieldAlert size={14} />
              {t("case.actions.amount_proposer", "You are the amount proposer. Propose an amount to advance to DGFAP.")}
            </div>

            {amountSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700" data-testid="amount-proposed-success">
                <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                <span>{amountSuccess}</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-medium text-blue-800">
                {t("case.amount_label", "Proposed amount (FCFA)")}
              </label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmountValue(e.target.value)}
                className="input border-blue-300 focus:border-blue-500 focus:ring-blue-500/20"
                placeholder="3000000"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-blue-800">
                {t("case.reason_label", "Reason / breakdown")}
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="input border-blue-300 focus:border-blue-500 focus:ring-blue-500/20"
                placeholder={t("case.reason_placeholder", "Hospital + 2 weeks salary + transport")}
              />
            </div>
            <button
              className="btn-primary w-full"
              disabled={busy || !amount || Number(amount) <= 0}
              onClick={async () => {
                const amt = Math.floor(Number(amount));
                setBusy(true); setError(null); setAmountSuccess(null);
                try {
                  await onSetAmount(amt, reason);
                  setAmountSuccess(
                    t("case.amount_proposed_success", "Amount of {{amount}} FCFA has been recorded. Click \"Advance to DGFAP\" below to continue.")
                      .replace("{{amount}}", amt.toLocaleString("fr-FR"))
                  );
                } catch (e: any) {
                  const data = e?.data ?? e;
                  let detail: string;
                  if (typeof data === "string") {
                    detail = data;
                  } else if (data?.detail) {
                    detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
                  } else if (data && typeof data === "object") {
                    const msgs = Object.entries(data)
                      .flatMap(([k, v]) => {
                        if (k === "non_field_errors" || k === "detail") return [];
                        const vals = Array.isArray(v) ? v : [v];
                        return vals.map((m: any) => typeof m === "string" ? `${k}: ${m}` : `${k}: ${JSON.stringify(m)}`);
                      });
                    detail = msgs.length ? msgs.join("; ") : JSON.stringify(data);
                  } else {
                    detail = String(e);
                  }
                  setError(detail);
                } finally {
                  setBusy(false);
                }
              }}
              data-testid="propose-amount-button"
            >
              {busy ? (
                <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t("common.saving", "Saving…")}</span>
              ) : (
                <>
                  <CircleDollarSign size={14} />
                  {t("case.propose_amount", "Propose amount")}
                </>
              )}
            </button>
            <button
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => { setApproveNotes(""); setApproveSuccess(false); setApproveOpen(true); }}
              data-testid="advance-to-dgfap"
            >
              <CheckCircle2 size={16} />
              {t("case.advance_to_dgfap", "Advance to DGFAP")}
            </button>
            {canDefer && (
              <button className="btn-secondary w-full" disabled={busy} onClick={() => setDeferOpen(true)}>
                <RotateCcw size={16} />
                {t("common.defer", "Defer to step {step}").replace("{step}", String(caseData.current_step - 1))}
              </button>
            )}
          </div>
        )}

        {isCurrentApprover && caseData.current_step === 5 && (
          <div className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-700">
              <ShieldAlert size={14} />
              {caseData.amount_authorized
                  ? t("case.actions.amount_decider_authorized", "Amount authorized. Review and approve for WCS payment processing.")
                : t("case.actions.amount_decider", "You are the amount-decider. Review the proposed amount, authorize or propose a new amount, then verify.")}
            </div>

            {/* Section 1: DGFC Proposed Amount (always shown) */}
            <div className="rounded-lg border border-amber-200 bg-white p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                {t("case.actions.dgfc_proposed", "DGFC Proposed Amount")}
              </div>
              <div className="mt-1 text-lg font-bold text-amber-900">
                {caseData.amount_proposed
                  ? formatXAF(Number(caseData.amount_proposed), lang)
                  : "—"}
              </div>
            </div>

            {/* Section 2: Authorization form — only when amount NOT yet authorized */}
            {!caseData.amount_authorized && (
              <div className="space-y-3 rounded-lg border border-amber-200 bg-white p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                  {t("case.actions.authorize_section", "Authorization")}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-800">
                    {t("case.amount_label", "Authorized amount (FCFA)")}
                  </label>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmountValue(e.target.value)}
                    className="input border-amber-300 focus:border-amber-500 focus:ring-amber-500/20"
                    placeholder={caseData.amount_proposed ? String(caseData.amount_proposed) : "3000000"}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-800">
                    {t("case.reason_label", "Reason / breakdown")}
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="input border-amber-300 focus:border-amber-500 focus:ring-amber-500/20"
                    placeholder={t("case.reason_placeholder", "Hospital + 2 weeks salary + transport")}
                  />
                </div>
                <button
                  className="btn-warning w-full"
                  disabled={busy || !amount || Number(amount) <= 0}
                  onClick={() => wrap(() => onSetAmount(Math.floor(Number(amount)), reason))}
                >
                  {t("case.authorize_amount", "Authorize amount")}
                </button>
              </div>
            )}

            {/* Section 2 (alternate): Show authorized amount when already set */}
            {caseData.amount_authorized && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                  {t("case.actions.dgfap_authorized", "DGFAP Authorized Amount")}
                </div>
                <div className="mt-1 text-lg font-bold text-emerald-900">
                  {formatXAF(Number(caseData.amount_authorized), lang)}
                </div>
              </div>
            )}

            {/* Section 3: Verify & Defer actions (separate from amount) */}
            <div className="space-y-2 pt-1">
              {caseData.amount_authorized && (
                <button
                  className="btn-primary w-full"
                  disabled={busy}
                  onClick={() => { setApproveNotes(""); setApproveSuccess(false); setApproveOpen(true); }}
                  data-testid="verify-and-send"
                >
                  <CheckCircle2 size={16} />
                    {t("case.verify_and_send", "Approve for WCS payment")}
                </button>
              )}
              {canDefer && (
                <button className="btn-secondary w-full" disabled={busy} onClick={() => setDeferOpen(true)}>
                  <RotateCcw size={16} />
                  {t("common.defer", "Defer to step {step}").replace("{step}", String(caseData.current_step - 1))}
                </button>
              )}
            </div>
          </div>
        )}

        {isCB && caseData.status === "DRAFT" && (
          <div className="space-y-2">
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              {t("case.fill_form_hint", "Fill the form on the left, then click Submit below.")}
            </p>
            <button
              className="btn-primary w-full"
              disabled={busy}
              onClick={() => wrap(onSubmit)}
            >
              {t("case.submit_button", "Submit case")}
            </button>
          </div>
        )}
        {isCB && caseData.status === "SUBMITTED" && (
          <div className="space-y-2">
            <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
              {t("case.submitted_hint", "Case submitted. Click Verify to advance to the approval chain.")}
            </p>
            <button className="btn-primary w-full" disabled={busy} onClick={() => wrap(onVerify)}>
              {t("case.verify", "Verify incident")}
            </button>
          </div>
        )}
        {isCB && caseData.status === "REJECTED" && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {t("case.rejected_note", "This case was rejected. Contact AB Entheos for next steps.")}
          </div>
        )}

        {isDeferred && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-center gap-2 font-semibold">
              <RotateCcw size={16} />
              {t("case.deferred_title", "Deferred — awaiting clarification")}
            </div>
            <p className="mt-1 text-xs text-amber-800">
              {t("case.deferred_body", "The previous approver sent this back to step {step} ({role}). Add a comment or update the case, then click Resume.")
                .replace("{step}", String(caseData.current_step))
                .replace("{role}", caseData.current_approver_role ?? "—")}
            </p>
            {lastDeferral && (
              <p className="mt-2 rounded bg-white px-2 py-1 text-xs italic text-amber-900">
                “{lastDeferral.notes}” — <strong>{lastDeferral.actor_email}</strong>
              </p>
            )}
            {canResume && (
              <button className="btn-primary mt-3 w-full" disabled={busy} onClick={() => wrap(() => onResume("Reviewed, resuming."))}>
                {t("case.resume_btn", "Resume review")}
              </button>
            )}
          </div>
        )}

        {caseData.status === "APPROVED" && user?.role === "WCS" && (
          <div className="space-y-3">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
              {t("case.approved_msg", "Approved. Awaiting payment confirmation.")}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
                <ClipboardCheck size={14} />
                {t("case.actions.close_hint", "Record disbursements, then close this claim.")}
              </div>
              <button
                className="btn-primary w-full"
                disabled={busy || (caseData.disbursement_summary?.count ?? 0) === 0}
                onClick={() => { setCloseComment(""); setCloseOpen(true); }}
                data-testid="close-claim-button"
              >
                <ClipboardCheck size={16} />
                {t("case.close_claim", "Close Claim")}
              </button>
              {(caseData.disbursement_summary?.count ?? 0) === 0 && (
                <p className="text-xs text-amber-600">
                  {t("case.close_no_disbursements", "At least one disbursement is required before closing.")}
                </p>
              )}
            </div>
          </div>
        )}
        {caseData.status === "APPROVED" && user?.role !== "WCS" && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {t("case.approved_msg", "Approved. Awaiting payment confirmation.")}
          </p>
        )}
        {caseData.status === "CLOSED" && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            {t("case.closed_msg", "Case closed.")}
          </p>
        )}

        {isAdmin && user?.role !== "SUPER_ADMIN" && !isCurrentApprover && !isCB && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            {t("case.admin_hint", "As an administrator you can view this case and add comments, but cannot act on it. Only the current approver role ({role}) can advance.")
              .replace("{role}", caseData.current_approver_role ?? "—")}
          </p>
        )}

        {isAdmin && user?.role === "SUPER_ADMIN" && (
          <div className="pt-2 border-t border-slate-100">
            <button
              className="btn-danger w-full"
              disabled={busy}
              onClick={() => setDeleteOpen(true)}
              data-testid="delete-case-button"
            >
              <Trash2 size={16} />
              {t("case.delete_case", "Delete Case")}
            </button>
          </div>
        )}
      </div>

      {approveOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && !approveSuccess && setApproveOpen(false)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="approve-modal">
            {approveSuccess ? (
              /* ── Success state ── */
              <div className="flex flex-col items-center py-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                  <CheckCircle2 size={40} className="text-emerald-600" />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  {t("case.approve_modal.success_title", "Case Approved")}
                </h3>
                <p className="mt-2 text-sm text-slate-500 text-center">
                  {t("case.approve_modal.success_body", "The case has been advanced to the next approver successfully.")}
                </p>
              </div>
            ) : (
              <>
                <h3 className="text-base font-semibold text-slate-900">
                  {t("case.approve_modal.title", "Approve this case?")}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    "case.approve_modal.body",
                    "The case will move to the next approver. Add an optional approval comment for the audit trail.",
                  )}
                </p>
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    {t("case.approve_modal.notes_label", "Approval comment (optional)")}
                  </label>
                  <textarea
                    rows={3}
                    value={approveNotes}
                    onChange={(e) => setApproveNotes(e.target.value)}
                    className="input resize-none"
                    placeholder={t("case.approve_modal.notes_placeholder", "e.g. Verified ID and ambulance receipt, advancing to WCS.")}
                    data-testid="approve-notes"
                  />
                </div>
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    className="btn-secondary"
                    onClick={() => setApproveOpen(false)}
                    disabled={busy}
                    data-testid="approve-cancel"
                  >
                    {t("common.no", "No")}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={busy}
                    data-testid="approve-confirm"
                    onClick={async () => {
                      setBusy(true); setError(null);
                      try {
                        await onAdvance(approveNotes.trim());
                        setApproveSuccess(true);
                      } catch (e: any) {
                        const data = e?.data ?? e;
                        let detail: string;
                        if (typeof data === "string") detail = data;
                        else if (data?.detail) detail = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
                        else detail = String(e);
                        setError(detail);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? (
                      <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> {t("common.saving", "Saving…")}</span>
                    ) : (
                      <><CheckCircle2 size={14} /> {t("common.yes", "Yes")}</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {rejectOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setRejectOpen(false)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="reject-modal">
            <h3 className="text-base font-semibold text-slate-900">
              {t("case.reject_modal.title", "Reject this case?")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t(
                "case.reject_modal.body",
                "The case will be marked as rejected. A reason is optional but recommended.",
              )}
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("case.reject_modal.notes_label", "Rejection reason (optional)")}
              </label>
              <textarea
                rows={3}
                value={rejectNotes}
                onChange={(e) => setRejectNotes(e.target.value)}
                className="input resize-none"
                placeholder={t("case.reject_modal.notes_placeholder", "e.g. Missing claimant ID document.")}
                data-testid="reject-notes"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setRejectOpen(false)}
                disabled={busy}
                data-testid="reject-cancel"
              >
                {t("common.no", "No")}
              </button>
              <button
                className="btn-danger"
                disabled={busy}
                data-testid="reject-confirm"
                onClick={async () => {
                  await wrap(() => onReject(rejectNotes.trim()));
                  setRejectOpen(false);
                }}
              >
                <XCircle size={14} /> {t("common.yes", "Yes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {closeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setCloseOpen(false)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="close-modal">
            <h3 className="text-base font-semibold text-slate-900">
              {t("case.close_modal.title", "Close this claim?")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t(
                "case.close_modal.body",
                "This action will close the case permanently. A closing comment is required for the audit trail.",
              )}
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("case.close_modal.comment_label", "Closing comment (required)")}
              </label>
              <textarea
                rows={3}
                value={closeComment}
                onChange={(e) => setCloseComment(e.target.value)}
                className="input resize-none"
                placeholder={t("case.close_modal.comment_placeholder", "e.g. All disbursements completed. Treatment + transport fully paid.")}
                data-testid="close-comment"
              />
              {!closeComment.trim() && (
                <p className="mt-1 text-xs text-rose-600">{t("case.comment_required", "Comment is required.")}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setCloseOpen(false)}
                disabled={busy}
                data-testid="close-cancel"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                className="btn-primary"
                disabled={busy || !closeComment.trim()}
                data-testid="close-confirm"
                onClick={async () => {
                  await wrap(async () => {
                    await closeCase(caseData.uid, closeComment.trim());
                    void refetch();
                  });
                  setCloseOpen(false);
                }}
              >
                <ClipboardCheck size={14} /> {t("case.close_modal.confirm", "Close Claim")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deferOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {t("case.defer_modal.title", "Defer this case")}
              </h3>
              <button onClick={() => { setDeferOpen(false); setDeferNotes(""); }} className="text-slate-400 hover:text-slate-600">
                <XCircle size={18} />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {t("case.defer_modal.body", "The case will move back to step {to} ({role}) so they can add more context.")
                .replace("{to}", String(caseData.current_step - 1))
                .replace("{role}", ROLE_FOR_STEP[caseData.current_step - 1] ?? "—")}
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-slate-600">
                {t("case.defer_modal.notes_label", "Why are you deferring? (required)")}
              </label>
              <textarea
                rows={4}
                value={deferNotes}
                onChange={(e) => setDeferNotes(e.target.value)}
                className="input resize-none"
                placeholder={t("case.defer_modal.notes_placeholder", "e.g. Please attach the village chief's statement before we can approve.")}
              />
              {!deferNotes.trim() && (
                <p className="mt-1 text-xs text-rose-600">{t("case.comment_required", "Comment is required.")}</p>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => { setDeferOpen(false); setDeferNotes(""); }}>
                {t("case.defer_modal.cancel", "Cancel")}
              </button>
              <button
                className="btn-primary"
                disabled={busy || !deferNotes.trim()}
                onClick={() => wrap(async () => {
                  await onDefer(deferNotes);
                  setDeferOpen(false);
                  setDeferNotes("");
                })}
              >
                <RotateCcw size={14} />
                {t("case.defer_modal.confirm", "Send back")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => !busy && setDeleteOpen(false)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="delete-modal">
            <h3 className="text-base font-semibold text-slate-900">
              {t("case.delete_modal.title", "Delete this case?")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t(
                "case.delete_modal.body",
                "This action will permanently remove the case from the system. The audit trail will be retained. This action cannot be undone.",
              )}
            </p>
            <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <strong>{caseData.claimant_name}</strong> — {caseData.uid}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                className="btn-secondary"
                onClick={() => setDeleteOpen(false)}
                disabled={busy}
                data-testid="delete-cancel"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                className="btn-danger"
                disabled={busy}
                data-testid="delete-confirm"
                onClick={async () => {
                  await wrap(async () => {
                    await onDelete();
                  });
                  setDeleteOpen(false);
                  // Navigate back to case list after successful delete
                  window.location.href = "/";
                }}
              >
                <Trash2 size={14} /> {t("case.delete_modal.confirm", "Delete Case")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
