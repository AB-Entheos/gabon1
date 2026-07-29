import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { CheckCircle2, FileText, Image as ImageIcon, FileType2, Download, RefreshCw, X } from "lucide-react";
import { useDeleteAttachmentMutation, useListSubmissionsQuery } from "@/api/hecApi";
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
}

const REQUIRED_FILE_SLOTS: Record<string, Slot[]> = {
  MEDICAL: [
    { id: "medical_report", labelKey: "case.files.slot_medical_report" },
    { id: "claimant_id", labelKey: "case.files.slot_claimant_id" },
    { id: "ambulance_receipt", labelKey: "case.files.slot_ambulance_receipt" },
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
  const [pendingDelete, setPendingDelete] = useState<FileRow | null>(null);
  const [deletingId, setDeletingId] = useState<number>(0);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);
  const baseSlots = REQUIRED_FILE_SLOTS[caseType] ?? DEFAULT_REQUIRED_FILE_SLOTS;
  const slots: Slot[] = [...baseSlots, { id: OTHER_SLOT_ID, label: t("case.files.other_slot", "Other") }];

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
        });
      }
    }
    return out;
  }, [data]);

  const completedSet = useMemo(() => {
    const set = new Set<string>();
    for (const file of files) {
      if (file.file_type) {
        set.add(file.file_type.toLowerCase());
      }
    }
    return set;
  }, [files]);

  const slotStatus = slots.map((slot) => ({
    ...slot,
    completed: completedSet.has(slot.id.toLowerCase()),
  }));

  const completedCount = slotStatus.filter((slot) => slot.completed).length;

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
          const slotFiles = files.filter(
            (f) => f.file_type && f.file_type.toLowerCase() === slot.id.toLowerCase(),
          );
          const firstFile = slotFiles[0];
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

              {slotFiles.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {slotFiles.map((f) => (
                    <li
                      key={f.id}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
                      title={f.description || f.filename}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText size={14} className="shrink-0 text-slate-500" />
                          <span className="truncate" title={f.filename}>{f.filename}</span>
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
                          <button
                            type="button"
                            onClick={() => setPendingDelete(f)}
                            disabled={deletingId === f.id}
                            className="text-slate-500 transition-colors hover:text-amber-600 disabled:opacity-50"
                            title={t("case.files.replace", "Replace file")}
                            data-testid={`delete-checklist-${f.id}`}
                          >
                            <RefreshCw size={12} />
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
          <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
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
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
          onClick={() => deletingId === 0 && setPendingDelete(null)}
        >
          <div
            className="card w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
            data-testid="delete-confirm-modal"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">
                {t("case.files.replace_title", "Replace this file?")}
              </h3>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId !== 0}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {t(
                "case.files.replace_body",
                'This will hide "{{filename}}" from this slot and allow you to upload a new version. The original file is retained for audit purposes.',
                { filename: pendingDelete.filename },
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingDelete(null)}
                disabled={deletingId !== 0}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="btn-primary bg-amber-600 hover:bg-amber-700"
                disabled={deletingId !== 0}
                data-testid="confirm-delete-checklist"
                onClick={async () => {
                  setDeletingId(pendingDelete.id);
                  try {
                    await deleteAttachment({
                      submissionId: pendingDelete.submission_id,
                      attachmentId: pendingDelete.id,
                      caseUid,
                    }).unwrap();
                    await refetch();
                    setPendingDelete(null);
                  } catch (err) {
                    console.error("replace attachment failed", err);
                  } finally {
                    setDeletingId(0);
                  }
                }}
              >
                <RefreshCw size={14} /> {deletingId === pendingDelete.id ? t("common.replacing", "Replacing…") : t("case.files.replace", "Replace")}
              </button>
            </div>
          </div>
        </div>
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