import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useSelector } from "react-redux";
import { CheckCircle2, FileText, Image as ImageIcon, FileType2, Download, RefreshCw, X, History, ChevronLeft, ChevronRight } from "lucide-react";
import {
  useDeleteAttachmentMutation,
  useListSlotHistoryQuery,
  useListSubmissionsQuery,
  usePresignUploadMutation,
  useFinishUploadMutation,
  useReplaceAttachmentMutation,
} from "@/api/hecApi";
import type { RootState } from "@/store";
import FileUploader from "@/components/FileUploader";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import { downloadAttachment } from "@/hooks/downloadAttachment";
import type { Language } from "@/store/authSlice";

interface Props {
  caseUid: string;
  caseType: string;
  lang: Language;
}

interface Slot {
  id: string;
  labelKey: string;
}

interface FileRow {
  id: number;
  filename: string;
  mime: string;
  size_bytes: number;
  file_type?: string;
  description?: string;
  uploaded_by_name?: string;
  submitted_at: string;
  scan_status: string;
  submission_id: number;
  uploaded_at?: string;
  superseded_by_id?: number | null;
  is_current?: boolean;
}

const REQUIRED_FILE_SLOTS: Record<string, Slot[]> = {
  MEDICAL: [
    { id: "medical_report", labelKey: "case.files.slot_medical_report" },
    { id: "claimant_id", labelKey: "case.files.slot_claimant_id" },
    { id: "receipt", labelKey: "case.files.slot_receipt" },
  ],
  BURIAL: [
    { id: "death_certificate", labelKey: "case.files.slot_death_certificate" },
    { id: "claimant_id", labelKey: "case.files.slot_claimant_id" },
    { id: "funeral_receipt", labelKey: "case.files.slot_funeral_receipt" },
  ],
};

const OTHER_SLOT_ID = "other";

const DEFAULT_REQUIRED_FILE_SLOTS: Slot[] = [
  { id: "supporting_document", labelKey: "case.files.slot_supporting_document" },
  { id: "claimant_id", labelKey: "case.files.slot_claimant_id" },
  { id: "case_photos", labelKey: "case.files.slot_case_photos" },
];

export default function CaseFileChecklist({ caseUid, caseType }: Props) {
  const { t } = useTranslation();
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const { data, isLoading, isError, error, refetch } = useListSubmissionsQuery(
    { uid: caseUid, includeBag: true },
    { skip: !caseUid, refetchOnMountOrArgChange: true },
  );
  const [deleteAttachment] = useDeleteAttachmentMutation();
  const [replaceAttachment] = useReplaceAttachmentMutation();
  const [presignUpload] = usePresignUploadMutation();
  const [finishUpload] = useFinishUploadMutation();
  // deleteAttachment is kept for the legacy soft-delete fallback path; we
  // no longer call it from the UI — replace is the new flow.
  void deleteAttachment;
  const [pendingDelete, setPendingDelete] = useState<FileRow | null>(null);
  const [deletingId, setDeletingId] = useState<number>(0);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const [historySlot, setHistorySlot] = useState<string | null>(null);
  const baseSlots = REQUIRED_FILE_SLOTS[caseType] ?? DEFAULT_REQUIRED_FILE_SLOTS;
  const slots: Slot[] = [...baseSlots, { id: OTHER_SLOT_ID, labelKey: "case.files.other_slot" }];

  const [selectedSlot, setSelectedSlot] = useState(slots[0]?.id ?? "");
  const [otherLabel, setOtherLabel] = useState("");
  const isOther = selectedSlot === OTHER_SLOT_ID;

  useEffect(() => {
    if (!slots.some((slot) => slot.id === selectedSlot)) {
      setSelectedSlot(slots[0]?.id ?? "");
    }
  }, [slots, selectedSlot]);

  const files: FileRow[] = useMemo(() => {
    if (!data) return [];
    const out: FileRow[] = [];
    for (const s of data.results) {
      for (const a of s.attachments) {
        out.push({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size_bytes: a.size_bytes,
          file_type: a.file_type,
          description: a.description,
          uploaded_by_name: a.uploaded_by_name,
          submitted_at: s.submitted_at,
          scan_status: a.scan_status,
          submission_id: s.id,
          uploaded_at: a.uploaded_at,
          superseded_by_id: a.superseded_by_id ?? null,
          is_current: a.is_current ?? (a.deleted_at == null && a.superseded_by_id == null),
        });
      }
    }
    return out;
  }, [data]);

  const completedSet = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      // Only "current" (non-superseded) files count for slot coverage.
      if (file.file_type && file.is_current) {
        set.add(file.file_type.toLowerCase());
      }
    }
    return set;
  }, [files]);

  // Base slot IDs (built-in slots).
  const baseSlotIds = useMemo(
    () => new Set(slots.map((s) => s.id.toLowerCase())),
    [slots],
  );

  // Discover custom file_types from uploaded files that aren't base slots or "other".
  const customSlots: Slot[] = useMemo(() => {
    const seen = new Set<string>();
    const result: Slot[] = [];
    for (const file of files) {
      if (!file.file_type || !file.is_current) continue;
      const ft = file.file_type;
      const key = ft.toLowerCase();
      if (baseSlotIds.has(key) || key === OTHER_SLOT_ID || seen.has(key)) continue;
      seen.add(key);
      result.push({ id: ft, labelKey: ft });
    }
    return result;
  }, [files, baseSlotIds]);

  const slotStatus = [
    ...slots.map((slot) => ({
      ...slot,
      completed: completedSet.has(slot.id.toLowerCase()),
    })),
    ...customSlots.map((slot) => ({
      ...slot,
      completed: completedSet.has(slot.id.toLowerCase()),
    })),
  ];

  const completedCount = slotStatus.filter((slot) => slot.completed).length;

  // All current (non-superseded) files for preview navigation
  const allCurrentFiles = useMemo(() => files.filter((f) => f.is_current), [files]);
  const previewIdx = useMemo(() => {
    if (!previewFile) return -1;
    return allCurrentFiles.findIndex((f) => f.id === previewFile.id);
  }, [previewFile, allCurrentFiles]);

  const handleDownload = useCallback(
    (file: FileRow) => {
      downloadAttachment(file.submission_id, file.id, file.filename, token);
    },
    [token],
  );

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {t("case.files.required_title", "Required case files")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t(
              "case.files.required_subtitle",
              "Upload the mandatory supporting documents for this case."
            )}
          </p>
        </div>
        <span className="text-xs text-slate-500">
          {completedCount}/{slots.length} {t("case.files.completed", "completed")}
        </span>
      </div>

      {isLoading && <div className="mt-4 text-slate-500" data-testid="files-loading">{t("common.loading", "Loading…")}</div>}

      {isError && (
        <div className="mt-4 flex items-start justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700" data-testid="files-error">
          <span>
            {t("case.files.load_error", "Could not load attached files. Please refresh.")}
            {error && "status" in (error as any) && (
              <span className="ml-2 text-xs">({(error as any).status})</span>
            )}
          </span>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-md border border-rose-300 bg-white px-2 py-0.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
            data-testid="files-refresh"
          >
            {t("common.retry", "Retry")}
          </button>
        </div>
      )}

      {!isLoading && !isError && data && (data.results ?? []).length === 0 && (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-500" data-testid="files-empty">
          {t("case.files.none_yet", "No files attached yet. Use the upload form below.")}
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slotStatus.map((slot) => {
          const allSlotFiles = files.filter(
            (f) => f.file_type && f.file_type.toLowerCase() === slot.id.toLowerCase(),
          );
          // "Live" files count for slot completion; superseded ones live in history only.
          const currentFiles = allSlotFiles.filter((f) => f.is_current);
          const supersededCount = allSlotFiles.length - currentFiles.length;
          const firstFile = currentFiles[0];
          return (
            <div
              key={slot.id}
              data-slot-completed={slot.completed ? "true" : "false"}
              data-slot-id={slot.id}
              className={`flex flex-col rounded-2xl border p-3 transition-colors ${
                slot.completed
                  ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-slate-900">
                  {slot.completed ? (
                    <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                  ) : (
                    <FileText size={16} className="shrink-0 text-slate-500" />
                  )}
                  <span className="truncate" title={t(slot.labelKey)}>{t(slot.labelKey)}</span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${
                    slot.completed
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {slot.completed
                    ? t("case.files.slot_completed", "Completed")
                    : t("case.files.slot_pending", "Pending")}
                </span>
              </div>

              {slot.completed && firstFile && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setPreviewFile(firstFile)}
                    className="block w-full cursor-pointer rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  >
                    <SlotFilePreview caseUid={caseUid} file={firstFile} />
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-emerald-800">
                    <div className="flex min-w-0 items-center gap-1.5">
                      {firstFile.mime.startsWith("image/") ? (
                        <ImageIcon size={12} className="shrink-0" />
                      ) : (
                        <FileType2 size={12} className="shrink-0" />
                      )}
                      <span className="truncate" title={firstFile.filename}>{firstFile.filename}</span>
                    </div>
                    <span className="shrink-0">{(firstFile.size_bytes / 1024).toFixed(1)} KB</span>
                  </div>
                  {firstFile.uploaded_by_name && (
                    <div className="mt-0.5 truncate text-[10px] text-emerald-700">
                      {t("case.files.uploaded_by", "Uploaded by")} {firstFile.uploaded_by_name}
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {firstFile && (
                    <button
                      type="button"
                      onClick={() => setPendingDelete(firstFile)}
                      disabled={deletingId === firstFile.id}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
                      title={t("case.files.replace", "Replace file")}
                      data-testid={`replace-checklist-${firstFile.id}`}
                    >
                      <RefreshCw size={11} />
                      {t("case.files.replace", "Replace file")}
                    </button>
                  )}
                  {supersededCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setHistorySlot(slot.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                      data-testid={`history-checklist-${slot.id}`}
                    >
                      <History size={11} />
                      {supersededCount === 1
                        ? t("case.files.history_count", "{{count}} previous version", { count: supersededCount })
                        : t("case.files.history_count_plural", "{{count}} previous versions", { count: supersededCount })}
                    </button>
                  )}
                </div>
              </div>

              {currentFiles.length > 1 && (
                <ul className="mt-3 space-y-2">
                  {currentFiles.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      title={f.description || f.filename}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewFile(f)}
                            className="flex min-w-0 items-center gap-2 text-left hover:underline focus:outline-none focus:ring-2 focus:ring-emerald-500/40 rounded"
                          >
                            {f.mime.startsWith("image/") ? (
                              <ImageIcon size={14} className="shrink-0 text-emerald-500" />
                            ) : (
                              <FileText size={14} className="shrink-0 text-slate-500" />
                            )}
                            <span className="truncate text-slate-700 hover:text-emerald-600" title={f.filename}>{f.filename}</span>
                          </button>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[11px] text-slate-500">
                          <span>{(f.size_bytes / 1024).toFixed(1)} KB</span>
                          <button
                            type="button"
                            onClick={() => handleDownload(f)}
                            className="text-slate-500 hover:text-emerald-600"
                            title={t("common.download", "Download")}
                          >
                            <Download size={12} />
                          </button>
                        </div>
                      </div>
                      {(f.description || f.uploaded_by_name) && (
                        <div className="mt-1 truncate text-[11px] text-slate-500">
                          {f.description && (
                            <span className="italic" title={f.description}>
                              “{f.description}”
                            </span>
                          )}
                          {f.description && f.uploaded_by_name && " · "}
                          {f.uploaded_by_name && (
                            <span>{t("case.files.uploaded_by", "Uploaded by")} {f.uploaded_by_name}</span>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {previewFile && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => setPreviewFile(null)}
        >
          <div className="card w-full max-w-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="rounded-full bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
                  disabled={previewIdx <= 0}
                  onClick={(e) => { e.stopPropagation(); setPreviewFile(allCurrentFiles[previewIdx - 1]); }}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className="rounded-full bg-slate-100 p-1 text-slate-600 hover:bg-slate-200"
                  disabled={previewIdx >= allCurrentFiles.length - 1}
                  onClick={(e) => { e.stopPropagation(); setPreviewFile(allCurrentFiles[previewIdx + 1]); }}
                >
                  <ChevronRight size={18} />
                </button>
                {allCurrentFiles.length > 1 && (
                  <span className="text-xs text-slate-400">{previewIdx + 1} / {allCurrentFiles.length}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-slate-900">{previewFile.filename}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {previewFile.uploaded_by_name && (
                    <>{t("case.files.uploaded_by", "Uploaded by")} <strong className="text-slate-700">{previewFile.uploaded_by_name}</strong> · </>
                  )}
                  {(previewFile.size_bytes / 1024).toFixed(1)} KB
                </p>
              </div>
              <button onClick={() => setPreviewFile(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <div className="mt-4 grid place-items-center rounded-lg border border-slate-200 bg-slate-50 p-2">
              <PreviewBody caseUid={caseUid} file={previewFile} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownload(previewFile)}
              >
                <Download size={14} /> {t("case.gallery.download", "Download")}
              </button>
              <button className="btn-primary" onClick={() => setPreviewFile(null)}>
                {t("common.close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <ReplaceFileModal
          file={pendingDelete}
          onClose={() => {
            if (deletingId === 0) setPendingDelete(null);
          }}
          busy={deletingId !== 0}
          t={t}
          onConfirm={async (newFile: File) => {
            setDeletingId(pendingDelete.id);
            try {
              // 1. Upload the new file via the normal presign → dev-put → finish flow.
              const presigned = await presignUpload({
                filename: newFile.name,
                mime: newFile.type || "application/octet-stream",
                size: newFile.size,
                case_uid: caseUid,
                file_type: pendingDelete.file_type,
              } as any).unwrap();
              const put = await fetch(presigned.url, {
                method: "PUT",
                body: newFile,
                headers: { "Content-Type": newFile.type || "application/octet-stream" },
              });
              if (!put.ok) throw new Error(`PUT failed: ${put.status}`);
              const buf = await newFile.arrayBuffer();
              const hash = await crypto.subtle.digest("SHA-256", buf);
              const sha = Array.from(new Uint8Array(hash))
                .map((b) => b.toString(16).padStart(2, "0"))
                .join("");
              const finished = await finishUpload({
                key: presigned.key,
                filename: newFile.name,
                mime: newFile.type || "application/octet-stream",
                size: newFile.size,
                sha256: sha,
                case_uid: caseUid,
                file_type: pendingDelete.file_type,
              } as any).unwrap();
              // 2. Mark the OLD attachment as superseded by the new one.
              await replaceAttachment({
                submissionId: pendingDelete.submission_id,
                attachmentId: pendingDelete.id,
                caseUid,
                newAttachmentId: finished.id,
              }).unwrap();
              await refetch();
              setPendingDelete(null);
            } catch (err) {
              console.error("replace attachment failed", err);
            } finally {
              setDeletingId(0);
            }
          }}
        />
      )}

      {historySlot && (
        <SlotHistoryModal
          caseUid={caseUid}
          slotId={historySlot}
          slotLabel={
            REQUIRED_FILE_SLOTS_LABELS[historySlot]
              ? t(REQUIRED_FILE_SLOTS_LABELS[historySlot])
              : historySlot
          }
          token={token}
          onClose={() => setHistorySlot(null)}
          onDownload={(row) => downloadAttachment(row.submission_id, row.id, row.filename, token)}
          t={t}
        />
      )}

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {t("case.files.upload_section_title", "Upload a required file")}
            </p>
            <p className="text-xs text-slate-500">
              {t(
                "case.files.upload_section_help",
                "Choose the document type below, then upload the file."
              )}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            <CheckCircle2 size={14} />
            {t("case.files.required_slot", "Required document")}
          </span>
        </div>

        <label className="mb-1 block text-xs font-medium text-slate-500">
          {t("case.files.selected_file_type", "File type")}
        </label>
        <select
          value={selectedSlot}
          onChange={(event) => setSelectedSlot(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          {slots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {t(slot.labelKey)}
            </option>
          ))}
        </select>

        {isOther && (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("case.files.other_label", "Name this document")}
            </label>
            <input
              type="text"
              value={otherLabel}
              onChange={(event) => setOtherLabel(event.target.value)}
              placeholder={t("case.files.other_placeholder", "e.g. witness statement")}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
        )}

        <div className="mt-4">
          <FileUploader
            caseUid={caseUid}
            attachToCase
            fixedFileType={isOther ? otherLabel.trim() || OTHER_SLOT_ID : selectedSlot}
            accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,.csv,application/vnd.ms-excel,text/plain,.txt"
            label={t("case.files.upload_button", "Upload selected required file")}
            showTypeInput={false}
            onUploaded={() => refetch()}
          />
        </div>
      </div>
    </section>
  );
}

function SlotFilePreview({ caseUid, file }: { caseUid: string; file: FileRow }) {
  const url = useAttachmentUrl({
    caseUid,
    submissionId: file.submission_id,
    attachmentId: file.id,
    mime: file.mime,
  });
  const isImage = file.mime.startsWith("image/");
  if (isImage && url) {
    return (
      <div className="relative h-24 w-full overflow-hidden rounded-lg border border-emerald-200 bg-emerald-100/40">
        <img
          src={url}
          alt={file.description || file.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
    );
  }
  return (
    <div className="flex h-24 w-full items-center justify-center rounded-lg border border-emerald-200 bg-emerald-100/60">
      {isImage ? (
        <ImageIcon size={28} className="text-emerald-600" />
      ) : (
        <FileType2 size={28} className="text-emerald-600" />
      )}
    </div>
  );
}

function PreviewBody({ caseUid, file }: { caseUid: string; file: FileRow }) {
  const url = useAttachmentUrl({
    caseUid,
    submissionId: file.submission_id,
    attachmentId: file.id,
    mime: file.mime,
  });
  const isImg = file.mime.startsWith("image/");
  if (isImg && url) {
    return (
      <img
        src={url}
        alt={file.filename}
        className="max-h-[60vh] max-w-full rounded-md object-contain"
      />
    );
  }
  if (isImg) {
    return (
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <ImageIcon size={48} />
        <p className="text-xs">{file.mime}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-slate-500">
      <FileType2 size={48} />
      <p className="text-xs">{file.mime}</p>
    </div>
  );
}

// Map slot ID → translation key, used by the history modal so we can label
// each history panel with the same human-readable name used elsewhere.
const REQUIRED_FILE_SLOTS_LABELS: Record<string, string> = {
  medical_report: "case.files.slot_medical_report",
  claimant_id: "case.files.slot_claimant_id",
  receipt: "case.files.slot_receipt",
  death_certificate: "case.files.slot_death_certificate",
  funeral_receipt: "case.files.slot_funeral_receipt",
  supporting_document: "case.files.slot_supporting_document",
  case_photos: "case.files.slot_case_photos",
  other: "case.files.other_slot",
};

function ReplaceFileModal({
  file,
  busy,
  onClose,
  onConfirm,
  t,
}: {
  file: FileRow;
  busy: boolean;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
  t: TFunction;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<File | null>(null);
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={() => !busy && onClose()}
      data-testid="replace-confirm-modal"
    >
      <div
        className="card w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-900">
            {t("case.files.replace_title", "Replace this file?")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={16} />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {t(
            "case.files.replace_body",
            'This will upload a new version to replace "{{filename}}". The original file is retained for audit and can be seen in the history below.',
            { filename: file.filename },
          )}
        </p>
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          <p>
            <strong>{t("common.download", "Download")}:</strong> {file.filename} ({(file.size_bytes / 1024).toFixed(1)} KB)
          </p>
          {file.file_type && (
            <p className="mt-1 text-[11px] text-slate-500">
              {t("case.files.selected_file_type", "File type")}: <code>{file.file_type}</code>
            </p>
          )}
        </div>
        <div className="mt-4">
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept="image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,.csv,application/vnd.ms-excel,text/plain,.txt"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setChosen(f ?? null);
            }}
            data-testid="replace-file-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="w-full rounded-lg border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm text-slate-700 hover:border-emerald-400 hover:bg-emerald-50/50 disabled:opacity-50"
          >
            {chosen
              ? chosen.name
              : t("case.files.upload_button", "Upload selected required file")}
          </button>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {t("common.cancel", "Cancel")}
          </button>
          <button
            type="button"
            className="btn-primary bg-amber-600 hover:bg-amber-700"
            disabled={busy || !chosen}
            data-testid="confirm-replace-checklist"
            onClick={() => chosen && onConfirm(chosen)}
          >
            <RefreshCw size={14} /> {busy ? t("common.replacing", "Replacing…") : t("case.files.replace", "Replace")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface SlotHistoryRow {
  id: number;
  filename: string;
  uploaded_at: string;
  uploaded_by: string;
  uploaded_by_name: string;
  is_current: boolean;
  deleted_at: string | null;
  superseded_by_id: number | null;
  scan_status: string;
  size_bytes: number;
  mime: string;
  submission_id: number;
  description: string;
}

function SlotHistoryModal({
  caseUid,
  slotId,
  slotLabel,
  token,
  onClose,
  onDownload,
  t,
}: {
  caseUid: string;
  slotId: string;
  slotLabel: string;
  token: string | null;
  onClose: () => void;
  onDownload: (row: SlotHistoryRow) => void;
  t: TFunction;
}) {
  const { data, isLoading } = useListSlotHistoryQuery(
    { caseUid, fileType: slotId },
    { refetchOnMountOrArgChange: true },
  );
  const rows: SlotHistoryRow[] = data?.results ?? [];
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      onClick={onClose}
      data-testid="slot-history-modal"
    >
      <div
        className="card w-full max-w-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <History size={16} className="text-slate-400" />
              {t("case.files.history", "Replacement history")} — {slotLabel}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {t("case.files.history_count", "{{count}} previous version", { count: rows.length })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={16} />
          </button>
        </div>
        <div className="mt-4 max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200">
          {isLoading && <div className="p-4 text-sm text-slate-500">{t("common.loading", "Loading…")}</div>}
          {!isLoading && rows.length === 0 && (
            <div className="p-4 text-sm text-slate-500">{t("case.files.history_empty", "No previous versions for this slot.")}</div>
          )}
          {!isLoading && rows.length > 0 && (
            <ul className="divide-y divide-slate-200">
              {[...rows].reverse().map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-900" title={row.filename}>{row.filename}</span>
                      {row.is_current ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          {t("case.files.current_version", "Current")}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                          {t("case.files.previous_version", "Previous version")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {t("case.files.uploaded_on", "Uploaded {{date}}", {
                        date: row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "—",
                      })}
                      {row.uploaded_by_name && <> · {t("case.files.uploaded_by", "Uploaded by")} <strong className="text-slate-700">{row.uploaded_by_name}</strong></>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onDownload(row)}
                    disabled={!token}
                    className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                    data-testid={`history-download-${row.id}`}
                  >
                    <Download size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button className="btn-primary" onClick={onClose}>
            {t("common.close", "Close")}
          </button>
        </div>
      </div>
    </div>
  );
}