import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import {
  Banknote,
  Building2,
  Calendar,
  FileText,
  AlertTriangle,
  Plus,
  X,
  Upload,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  History,
  Eye,
  Shield,
} from "lucide-react";
import {
  useListDisbursementsQuery,
  useRecordDisbursementMutation,
  useUpdateDisbursementMutation,
  useDeleteDisbursementMutation,
  useAttachDisbursementProofMutation,
  useListDisbursementHistoryQuery,
  usePresignUploadMutation,
  useFinishUploadMutation,
} from "@/api/hecApi";
import type { RootState } from "@/store";

interface Props {
  caseUid: string;
}

const RECIPIENT_KINDS = [
  { value: "CLAIMANT", label_en: "Claimant" },
  { value: "HOSPITAL", label_en: "Hospital / clinic" },
  { value: "MORTUARY", label_en: "Mortuary / funeral home" },
  { value: "PHARMACY", label_en: "Pharmacy" },
  { value: "TRANSPORT", label_en: "Transport (ambulance)" },
  { value: "GOVERNMENT", label_en: "Government / ministry" },
  { value: "INSURANCE", label_en: "Insurance" },
  { value: "OTHER", label_en: "Other" },
];

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  DISBURSEMENT_RECORDED: { label: "Payment recorded", color: "bg-emerald-100 text-emerald-800" },
  DISBURSEMENT_UPDATED: { label: "Payment updated", color: "bg-amber-100 text-amber-800" },
  DISBURSEMENT_DELETED: { label: "Payment deleted", color: "bg-rose-100 text-rose-800" },
  PROOF_UPLOADED: { label: "Proof uploaded", color: "bg-sky-100 text-sky-800" },
};

function fmt(n: number) {
  return n.toLocaleString("fr-FR");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* ── Info Field ────────────────────────────────────────────────────────── */

function InfoField({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  );
}

/* ── Details Tab ───────────────────────────────────────────────────────── */

function DetailsTab({ disbursement: d }: { disbursement: NonNullable<ReturnType<typeof useListDisbursementsQuery>["data"]>["results"][number] }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <InfoField label={t("case.disbursements.recipient_kind", "Recipient kind")}>
          <span className="inline-flex items-center gap-1">
            {d.recipient_kind === "CLAIMANT" ? <Banknote size={12} className="text-emerald-600" /> : <Building2 size={12} className="text-sky-600" />}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              {d.recipient_kind}
            </span>
          </span>
        </InfoField>
        <InfoField label={t("case.disbursements.amount", "Amount")}>
          <span className="font-bold text-emerald-700">{fmt(d.amount_xaf)} FCFA</span>
        </InfoField>
        <InfoField label={t("case.disbursements.purpose", "Purpose")}>
          <span className="text-slate-900">{d.purpose}</span>
        </InfoField>
        <InfoField label={t("case.disbursements.payment_date", "Payment date")}>
          <span className="text-slate-900">{d.payment_date}</span>
        </InfoField>
        <InfoField label={t("case.disbursements.payment_reference", "Payment reference")}>
          <span className="text-slate-900">{d.payment_reference || "—"}</span>
        </InfoField>
        <InfoField label={t("case.disbursements.recorded_by", "Recorded by")}>
          <span className="text-slate-900">{d.paid_by}</span>
        </InfoField>
        <InfoField label={t("case.disbursements.created_at", "Created at")} className="col-span-2">
          <span className="text-slate-900">{fmtDateTime(d.created_at)}</span>
        </InfoField>
      </div>
      {d.notes && (
        <InfoField label={t("case.disbursements.notes", "Notes")} className="col-span-2">
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{d.notes}</p>
        </InfoField>
      )}
      {d.proof_of_payment ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} className="text-sky-600" />
            <span className="font-medium text-sky-800">{d.proof_of_payment.filename}</span>
            <span className="text-sky-600">({(d.proof_of_payment.size_bytes / 1024).toFixed(1)} KB)</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-center text-xs text-slate-500">
          {t("case.disbursements.no_proof", "No proof of payment attached yet.")}
        </div>
      )}
    </div>
  );
}

/* ── Edit Tab ──────────────────────────────────────────────────────────── */

function EditTab({ caseUid, disbursement: d, onClose }: { caseUid: string; disbursement: NonNullable<ReturnType<typeof useListDisbursementsQuery>["data"]>["results"][number]; onClose: () => void }) {
  const { t } = useTranslation();
  const [updateDisbursement, { isLoading }] = useUpdateDisbursementMutation();
  const [amount, setAmount] = useState(String(d.amount_xaf));
  const [purpose, setPurpose] = useState(d.purpose);
  const [recipientKind, setRecipientKind] = useState(d.recipient_kind);
  const [recipientName, setRecipientName] = useState(d.recipient_name);
  const [paymentDate, setPaymentDate] = useState(d.payment_date);
  const [paymentReference, setPaymentReference] = useState(d.payment_reference);
  const [notes, setNotes] = useState(d.notes || "");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseInt(amount, 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Amount must be > 0.");
      return;
    }
    try {
      await updateDisbursement({
        caseUid,
        disbursementId: d.id,
        body: {
          amount_xaf: amt,
          purpose: purpose.trim(),
          recipient_kind: recipientKind,
          recipient_name: recipientName.trim(),
          payment_date: paymentDate,
          payment_reference: paymentReference.trim(),
          notes: notes.trim(),
        },
      }).unwrap();
      onClose();
    } catch (err: any) {
      setError(err?.data?.detail || String(err));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.amount", "Amount (FCFA)")} *</span>
          <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.recipient_kind", "Recipient kind")} *</span>
          <select value={recipientKind} onChange={(e) => setRecipientKind(e.target.value)} className="input mt-1">
            {RECIPIENT_KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label_en}</option>))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.recipient_name", "Recipient name")} *</span>
          <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required className="input mt-1" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.purpose", "Purpose")} *</span>
          <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} required className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.payment_date", "Payment date")} *</span>
          <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="input mt-1" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.payment_reference", "Payment reference")}</span>
          <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="input mt-1" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-slate-600">{t("case.disbursements.notes", "Notes")}</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="input mt-1" rows={2} />
        </label>
      </div>
      {error && (<div className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>)}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          {t("common.cancel", "Cancel")}
        </button>
        <button type="submit" disabled={isLoading} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">
          {isLoading ? t("common.saving", "Saving…") : t("case.disbursements.save_changes", "Save changes")}
        </button>
      </div>
    </form>
  );
}

/* ── Proof Upload Tab ──────────────────────────────────────────────────── */

function ProofTab({ caseUid, disbursement: d }: { caseUid: string; disbursement: NonNullable<ReturnType<typeof useListDisbursementsQuery>["data"]>["results"][number] }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [presignUpload] = usePresignUploadMutation();
  const [finishUpload] = useFinishUploadMutation();
  const [attachProof] = useAttachDisbursementProofMutation();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setSuccess(false);
    try {
      const presigned = await presignUpload({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        case_uid: caseUid,
        file_type: "proof_of_payment",
        description: `Proof of payment for disbursement #${d.id}`,
        uploaded_by_name: "WCS",
      }).unwrap();
      await fetch(presigned.url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      const buf = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
      const sha256 = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
      const finished = await finishUpload({
        key: presigned.key,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        sha256,
        submission_id: presigned.submission_id,
        case_uid: caseUid,
        file_type: "proof_of_payment",
        description: `Proof of payment for disbursement #${d.id}`,
        uploaded_by_name: "WCS",
      }).unwrap();
      await attachProof({ caseUid, disbursementId: d.id, proof_of_payment_id: finished.id }).unwrap();
      setSuccess(true);
    } catch (err: any) {
      setUploadError(err?.data?.detail || err?.message || String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-4">
      {d.proof_of_payment && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3">
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} className="text-sky-600" />
            <span className="font-medium text-sky-800">Current: {d.proof_of_payment.filename}</span>
            <span className="text-sky-600">({(d.proof_of_payment.size_bytes / 1024).toFixed(1)} KB)</span>
          </div>
          <p className="mt-1 text-xs text-sky-600">
            {t("case.disbursements.replace_proof_hint", "Upload a new file to replace the current proof.")}
          </p>
        </div>
      )}
      <div
        className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6 transition-colors hover:border-emerald-400 hover:bg-emerald-50/30"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files[0];
          if (fileRef.current && file) {
            const dt = new DataTransfer();
            dt.items.add(file);
            fileRef.current.files = dt.files;
            handleFileChange({ target: { files: [file] } } as any);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <Upload size={24} className={uploading ? "animate-bounce text-emerald-600" : "text-slate-400"} />
        <p className="mt-2 text-sm text-slate-600">
          {uploading ? t("case.disbursements.uploading", "Uploading…") : t("case.disbursements.drop_or_click", "Drop a file here or click to browse")}
        </p>
        <p className="mt-1 text-xs text-slate-400">
          {t("case.disbursements.file_types", "PDF, JPG, PNG — max 25 MB")}
        </p>
        <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
      </div>
      {uploadError && (<div className="rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{uploadError}</div>)}
      {success && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-sm text-emerald-700 flex items-center gap-2">
          <CheckCircle2 size={14} />
          {t("case.disbursements.proof_attached", "Proof of payment attached successfully.")}
        </div>
      )}
    </div>
  );
}

/* ── History Tab ───────────────────────────────────────────────────────── */

function HistoryTab({ caseUid }: { caseUid: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useListDisbursementHistoryQuery(caseUid, { skip: !caseUid });
  const events = data?.results ?? [];

  if (isLoading) return <div className="text-sm text-slate-500">{t("common.loading", "Loading…")}</div>;
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {t("case.disbursements.no_history", "No disbursement activity yet.")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 mb-3">
        <History size={14} className="text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {t("case.disbursements.audit_trail", "Audit Trail")}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          {events.length}
        </span>
      </div>
      <div className="relative ml-3 border-l-2 border-slate-200 space-y-3">
        {events.map((ev) => {
          const meta = EVENT_TYPE_LABELS[ev.event_type] ?? { label: ev.event_type, color: "bg-slate-100 text-slate-800" };
          return (
            <div key={ev.id} className="relative pl-5">
              <div className={`absolute -left-[9px] top-1 h-3.5 w-3.5 rounded-full border-2 border-white ${
                ev.event_type === "DISBURSEMENT_DELETED" ? "bg-rose-500" :
                ev.event_type === "DISBURSEMENT_UPDATED" ? "bg-amber-500" :
                ev.event_type === "PROOF_UPLOADED" ? "bg-sky-500" :
                "bg-emerald-500"
              }`} />
              <div className="rounded-lg border border-slate-100 bg-white p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-slate-400">{fmtDateTime(ev.occurred_at)}</span>
                </div>
                <p className="mt-1 text-xs text-slate-700">{ev.notes}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                  <Shield size={10} />
                  <span>{ev.actor_email} ({ev.actor_role})</span>
                  {ev.idempotency_key && <span className="font-mono">key: {ev.idempotency_key.slice(0, 8)}…</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Delete Confirmation ───────────────────────────────────────────────── */

function DeleteConfirmation({ caseUid, disbursementId, onClose, onCancel }: {
  caseUid: string;
  disbursementId: number;
  onClose: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [deleteDisbursement, { isLoading }] = useDeleteDisbursementMutation();

  async function handleDelete() {
    try {
      await deleteDisbursement({ caseUid, disbursementId }).unwrap();
      onClose();
    } catch (err) {
      console.error("delete disbursement failed", err);
    }
  }

  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
      <p className="text-sm text-rose-800 font-medium">
        {t("case.disbursements.delete_confirm", "Are you sure you want to delete this payment?")}
      </p>
      <p className="mt-1 text-xs text-rose-600">
        {t("case.disbursements.delete_hint", "This action will be recorded in the audit trail. The payment will no longer count toward the budget.")}
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={isLoading} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          {t("common.cancel", "Cancel")}
        </button>
        <button type="button" onClick={handleDelete} disabled={isLoading} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-rose-700 disabled:opacity-50">
          <Trash2 size={14} />
          {isLoading ? t("common.deleting", "Deleting…") : t("case.disbursements.delete", "Delete payment")}
        </button>
      </div>
    </div>
  );
}

/* ── Expanded Card (Modal) ─────────────────────────────────────────────── */

type DisbItem = NonNullable<ReturnType<typeof useListDisbursementsQuery>["data"]>["results"][number];

function ExpandedCard({ caseUid, disbursement: d, isWCS, onClose }: {
  caseUid: string;
  disbursement: DisbItem;
  isWCS: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"details" | "edit" | "proof" | "history">("details");
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto p-0" onClick={(e) => e.stopPropagation()} data-testid="disbursement-modal">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3 rounded-t-2xl">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900 truncate">{d.recipient_name}</h3>
            <div className="text-sm font-bold text-emerald-700">{fmt(d.amount_xaf)} FCFA</div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="close">
            <X size={18} />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-5 overflow-x-auto">
          {(["details", "edit", "proof", "history"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                activeTab === tab ? "border-b-2 border-emerald-600 text-emerald-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab === "details" && <Eye size={12} className="mr-1 inline" />}
              {tab === "edit" && <Pencil size={12} className="mr-1 inline" />}
              {tab === "proof" && <Upload size={12} className="mr-1 inline" />}
              {tab === "history" && <Clock size={12} className="mr-1 inline" />}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
        {/* Tab Content */}
        <div className="p-5">
          {activeTab === "details" && <DetailsTab disbursement={d} />}
          {activeTab === "edit" && isWCS && <EditTab caseUid={caseUid} disbursement={d} onClose={onClose} />}
          {activeTab === "proof" && isWCS && <ProofTab caseUid={caseUid} disbursement={d} />}
          {activeTab === "history" && <HistoryTab caseUid={caseUid} />}
          {/* Delete action */}
          {activeTab === "details" && isWCS && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              {!confirmDelete ? (
                <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50">
                  <Trash2 size={14} /> {t("case.disbursements.delete", "Delete payment")}
                </button>
              ) : (
                <DeleteConfirmation
                  caseUid={caseUid}
                  disbursementId={d.id}
                  onClose={() => { setConfirmDelete(false); onClose(); }}
                  onCancel={() => setConfirmDelete(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ────────────────────────────────────────────────────── */

export default function DisbursementHistory({ caseUid }: Props) {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);
  const isWCS = user?.role === "WCS";
  const { data, isLoading, refetch } = useListDisbursementsQuery(caseUid, { skip: !caseUid });
  const [recordDisbursement, { isLoading: recording }] = useRecordDisbursementMutation();
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const [recipientKind, setRecipientKind] = useState("CLAIMANT");
  const [recipientName, setRecipientName] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentReference, setPaymentReference] = useState("");

  const authorized = data?.authorized_xaf ?? 0;
  const disbursed = data?.disbursed_xaf ?? 0;
  const remaining = data?.remaining_xaf ?? 0;
  const utilization = data?.utilization_pct ?? 0;
  const approaching = data?.approaching_limit ?? false;
  const items = data?.results ?? [];

  const canRecord = isWCS && authorized > 0 && remaining > 0;
  const expandedItem = items.find((d) => d.id === expandedId) ?? null;

  function reset() {
    setAmount("");
    setPurpose("");
    setRecipientKind("CLAIMANT");
    setRecipientName("");
    setPaymentDate(todayISO());
    setPaymentReference("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amt = parseInt(amount, 10);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Amount must be > 0.");
      return;
    }
    try {
      await recordDisbursement({
        caseUid,
        body: {
          amount_xaf: amt,
          purpose: purpose.trim(),
          recipient_kind: recipientKind,
          recipient_name: recipientName.trim(),
          payment_date: paymentDate,
          payment_reference: paymentReference.trim(),
        },
      }).unwrap();
      reset();
      setShowForm(false);
      void refetch();
    } catch (err: any) {
      setError(err?.data?.detail || String(err));
    }
  }

  return (
    <section className="card p-5" data-section="disbursements">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {t("case.disbursements.title", "Disbursements")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("case.disbursements.subtitle", "Payments made against the authorized amount.")}
          </p>
        </div>
        {canRecord && !showForm && (
          <button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700" data-testid="add-disbursement">
            <Plus size={14} /> {t("case.disbursements.add", "Record payment")}
          </button>
        )}
      </div>

      {/* Summary bar */}
      {authorized > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("case.disbursements.authorized", "Authorized")}</div>
              <div className="mt-0.5 text-base font-bold text-slate-900">{fmt(authorized)} FCFA</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("case.disbursements.disbursed", "Disbursed")}</div>
              <div className="mt-0.5 text-base font-bold text-emerald-700">{fmt(disbursed)} FCFA</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("case.disbursements.remaining", "Remaining")}</div>
              <div className={`mt-0.5 text-base font-bold ${remaining > 0 ? "text-slate-900" : "text-rose-700"}`}>{fmt(remaining)} FCFA</div>
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full transition-all ${approaching ? "bg-rose-600" : "bg-emerald-600"}`} style={{ width: `${Math.min(100, utilization)}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-slate-500">
            {utilization.toFixed(1)}% {t("case.disbursements.utilized", "of budget used")}
          </div>
        </div>
      )}

      {/* Approaching-limit warning */}
      {approaching && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800" role="alert" data-testid="approaching-limit-banner">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-rose-600" />
          <div>
            <strong className="font-semibold">{t("case.disbursements.warning_title", "Approaching budget limit")}</strong>
            <div className="text-rose-700">
              {t("case.disbursements.warning_body", "Disbursements have reached {{pct}}% of the authorized amount. Plan remaining payments carefully.").replace("{{pct}}", utilization.toFixed(1))}
            </div>
          </div>
        </div>
      )}

      {/* Add-form */}
      {showForm && (
        <form onSubmit={onSubmit} className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">{t("case.disbursements.new_title", "Record a new disbursement")}</h3>
            <button type="button" onClick={() => { setShowForm(false); reset(); }} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="close">
              <X size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.amount", "Amount (FCFA)")} *</span>
              <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" data-testid="disbursement-amount" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.recipient_kind", "Recipient kind")} *</span>
              <select value={recipientKind} onChange={(e) => setRecipientKind(e.target.value)} className="input mt-1" data-testid="disbursement-recipient-kind">
                {RECIPIENT_KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label_en}</option>))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.recipient_name", "Recipient name")} *</span>
              <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required className="input mt-1" placeholder="e.g. Paulin Andzongo Hospital" data-testid="disbursement-recipient-name" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.purpose", "Purpose")} *</span>
              <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} required className="input mt-1" placeholder="e.g. Hospital bill" data-testid="disbursement-purpose" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.payment_date", "Payment date")} *</span>
              <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className="input mt-1" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-slate-600">{t("case.disbursements.payment_reference", "Payment reference")}</span>
              <input type="text" value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} className="input mt-1" placeholder="e.g. AIRTEL-MOMO-001" />
            </label>
          </div>
          {error && (<div className="mt-3 rounded-lg border border-rose-300 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>)}
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" onClick={() => { setShowForm(false); reset(); }} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              {t("common.cancel", "Cancel")}
            </button>
            <button type="submit" disabled={recording} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50" data-testid="submit-disbursement">
              {recording ? t("common.saving", "Saving…") : t("case.disbursements.save", "Record payment")}
            </button>
          </div>
        </form>
      )}

      {/* Disbursement cards */}
      {isLoading ? (
        <div className="mt-4 text-slate-500">{t("common.loading", "Loading…")}</div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500">
          {authorized === 0 ? t("case.disbursements.empty_no_budget", "No amount has been authorized yet.") : t("case.disbursements.empty", "No disbursements recorded yet.")}
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {items.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => setExpandedId(d.id)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-emerald-300 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
                data-disbursement-id={d.id}
                data-testid={`disbursement-card-${d.id}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {d.recipient_kind === "CLAIMANT" ? (<Banknote size={14} className="shrink-0 text-emerald-600" />) : (<Building2 size={14} className="shrink-0 text-sky-600" />)}
                      <span className="truncate font-semibold text-slate-900">{d.recipient_name}</span>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{d.recipient_kind}</span>
                      {d.proof_of_payment && (
                        <span className="shrink-0 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 flex items-center gap-0.5">
                          <FileText size={9} /> Proof
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1"><FileText size={11} /> {d.purpose}</span>
                      <span className="flex items-center gap-1"><Calendar size={11} /> {d.payment_date}</span>
                      {d.payment_reference && <span>ref: {d.payment_reference}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <div className="text-base font-bold text-emerald-700">{fmt(d.amount_xaf)} FCFA</div>
                      <div className="text-[10px] text-slate-500">by {d.paid_by}</div>
                    </div>
                    <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Expanded modal */}
      {expandedItem && (
        <ExpandedCard
          caseUid={caseUid}
          disbursement={expandedItem}
          isWCS={isWCS}
          onClose={() => { setExpandedId(null); void refetch(); }}
        />
      )}
    </section>
  );
}
