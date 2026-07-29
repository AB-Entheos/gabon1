import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Image as ImageIcon, FileText, Download, ExternalLink, Layers, RefreshCw } from "lucide-react";
import { useDeleteAttachmentMutation, useListSubmissionsQuery } from "@/api/hecApi";
import type { RootState } from "@/store";
import { RoleBadge } from "@/components/StatusChip";
import { formatDateTime } from "@/api/format";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import { downloadAttachment } from "@/hooks/downloadAttachment";
import type { Language } from "@/store/authSlice";

interface Props {
  caseUid: string;
  lang: Language;
}

interface AttachmentRow {
  id: number;
  filename: string;
  mime: string;
  size_bytes: number;
  scan_status: string;
  file_type?: string;
  submission_id: number;
  submission_form: string;
  submission_at: string;
  submitted_by: string;
  role_at_submission: string;
}

const STAGE_ORDER = ["CB", "DP", "AB", "WCS", "DGFC", "DGFAP", "MINISTER", "ADMIN"] as const;

function isImage(mime: string) {
  return mime.startsWith("image/");
}

function fmtSize(bytes: number, _lang: Language) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function EvidenceGallery({ caseUid, lang }: Props) {
  const { t } = useTranslation();
  const token = useSelector((s: RootState) => s.auth.accessToken);
  const { data, isLoading } = useListSubmissionsQuery({ uid: caseUid, includeBag: true }, { skip: !caseUid });
  const [deleteAttachment, { isLoading: deleting }] = useDeleteAttachmentMutation();
  const [pendingDelete, setPendingDelete] = useState<AttachmentRow | null>(null);

  const handleDownload = useCallback(
    (att: AttachmentRow) => {
      downloadAttachment(att.submission_id, att.id, att.filename, token);
    },
    [token],
  );

  // Flatten all attachments across all submissions with the role that uploaded them.
  // The synthetic "case_files_bag" submission is the backing store for both the
  // Required Case Files checklist AND the "Upload evidence (camera)" sidebar.
  // To avoid duplication we hide only those bag entries that have a `file_type`
  // (i.e. slotted into a required document); the camera/upload-evidence
  // uploads come through without a file_type and ARE shown here.
  const rows: AttachmentRow[] = useMemo(() => {
    if (!data) return [];
    const out: AttachmentRow[] = [];
    for (const s of data.results) {
      const isBag = s.form?.startsWith("case_files_bag@");
      for (const a of s.attachments) {
        // file_type can be null, "", or [] — only skip if it's a non-empty string
        const hasFileType = typeof a.file_type === "string" && a.file_type.length > 0;
        if (isBag && hasFileType) continue;
        out.push({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size_bytes: a.size_bytes,
          scan_status: a.scan_status,
          file_type: a.file_type,
          submission_id: s.id,
          submission_form: s.form,
          submission_at: s.submitted_at,
          submitted_by: s.submitted_by,
          role_at_submission: s.role_at_submission,
        });
      }
    }
    return out.sort((x, y) => (x.submission_at < y.submission_at ? 1 : -1));
  }, [data]);

  // Group by the role that uploaded, in pipeline order.
  const grouped = useMemo(() => {
    const map = new Map<string, AttachmentRow[]>();
    for (const r of rows) {
      const key = STAGE_ORDER.includes(r.role_at_submission as any)
        ? r.role_at_submission
        : "ADMIN";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // Preserve pipeline order for known roles, then append unknown
    const ordered: [string, AttachmentRow[]][] = [];
    for (const stage of STAGE_ORDER) {
      if (map.has(stage)) ordered.push([stage, map.get(stage)!]);
    }
    if (map.has("ADMIN")) ordered.push(["ADMIN", map.get("ADMIN")!]);
    return ordered;
  }, [rows]);

  const [preview, setPreview] = useState<AttachmentRow | null>(null);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Layers size={16} className="text-slate-400" />
            {t("case.gallery.title", "Evidence gallery")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {t("case.gallery.subtitle", "All photos and attachments, grouped by who uploaded them.")}
          </p>
        </div>
        <span className="text-xs text-slate-500">{rows.length} {t("case.gallery.files", "files")}</span>
      </div>

      {isLoading && <div className="mt-4 text-slate-500">{t("common.loading", "Loading…")}</div>}

      {!isLoading && rows.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">{t("case.gallery.empty", "No attachments yet.")}</p>
      )}

      {grouped.length > 0 && (
        <div className="mt-5 space-y-6">
          {grouped.map(([role, items]) => (
            <div key={role}>
              <div className="mb-2 flex items-center gap-2">
                <RoleBadge role={role} />
                <span className="text-xs text-slate-500">
                  {items.length} {t("case.gallery.files", "files")}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {items.map((a) => (
                  <AttachmentTile
                    key={a.id}
                    att={a}
                    onOpen={() => setPreview(a)}
                    onDelete={() => setPendingDelete(a)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setPreview(null)}>
          <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{preview.filename}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {t("case.gallery.by", "Uploaded by")}{" "}
                  <strong className="text-slate-700">{preview.submitted_by}</strong>{" "}
                  · <RoleBadge role={preview.role_at_submission} />{" "}
                  · {formatDateTime(preview.submission_at, lang)} · {fmtSize(preview.size_bytes, lang)}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div className="mt-4 grid place-items-center rounded-lg border border-slate-200 bg-slate-50 p-2">
              <PreviewBody att={preview} />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleDownload(preview)}
                title="Download"
              >
                <Download size={14} /> {t("case.gallery.download", "Download")}
              </button>
              <button
                type="button"
                className="btn-secondary border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                onClick={() => setPendingDelete(preview)}
              >
                <RefreshCw size={14} /> {t("case.gallery.replace", "Replace")}
              </button>
              <button className="btn-primary" onClick={() => setPreview(null)}>
                <ExternalLink size={14} /> {t("common.close", "Close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => !deleting && setPendingDelete(null)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-slate-900">
              {t("case.gallery.replace_title", "Replace this file?")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t(
                "case.gallery.replace_body",
                'This will hide "{{filename}}" from the gallery and upload a new version. The original file is retained for audit purposes.',
                { filename: pendingDelete.filename },
              )}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setPendingDelete(null)}
                disabled={deleting}
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="button"
                className="btn-primary bg-amber-600 hover:bg-amber-700"
                disabled={deleting}
                data-testid="confirm-delete-attachment"
                onClick={async () => {
                  try {
                    await deleteAttachment({
                      submissionId: pendingDelete.submission_id,
                      attachmentId: pendingDelete.id,
                      caseUid,
                    }).unwrap();
                    setPendingDelete(null);
                    setPreview(null);
                  } catch (err) {
                    console.error("replace attachment failed", err);
                  }
                }}
              >
                <RefreshCw size={14} /> {deleting ? t("common.replacing", "Replacing…") : t("case.gallery.replace", "Replace")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AttachmentTile({ att, onOpen, onDelete }: { att: AttachmentRow; onOpen: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const url = useAttachmentUrl({
    caseUid: att.submission_form,
    submissionId: att.submission_id,
    attachmentId: att.id,
    mime: att.mime,
  });
  return (
    <div className="group relative">
      <button
        onClick={onOpen}
        className="relative flex aspect-square w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        {isImage(att.mime) && url ? (
          <img
            src={url}
            alt={att.filename}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : isImage(att.mime) ? (
          <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-700">
            <ImageIcon size={18} />
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 text-slate-600">
            <FileText size={18} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-1.5 text-white">
          <div className="truncate text-[10px] font-medium" title={att.filename}>{att.filename}</div>
          <div className="mt-0.5 flex items-center gap-1 text-[9px] text-slate-200">
            <span className="truncate">{att.submitted_by}</span>
            <span>·</span>
            <span>{fmtSize(att.size_bytes, "en")}</span>
          </div>
        </div>
        {att.scan_status !== "CLEAN" && (
          <span className="absolute right-1 top-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">
            {att.scan_status}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title={t("case.gallery.replace", "Replace")}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-amber-600 opacity-0 shadow-sm transition-opacity hover:bg-amber-50 hover:text-amber-700 group-hover:opacity-100"
        data-testid={`delete-tile-${att.id}`}
      >
        <RefreshCw size={10} />
      </button>

    </div>
  );
}

function PreviewBody({ att }: { att: AttachmentRow }) {
  const url = useAttachmentUrl({
    caseUid: att.submission_form,
    submissionId: att.submission_id,
    attachmentId: att.id,
    mime: att.mime,
  });
  if (isImage(att.mime) && url) {
    return (
      <img
        src={url}
        alt={att.filename}
        className="max-h-[60vh] max-w-full rounded-md object-contain"
      />
    );
  }
  if (isImage(att.mime)) {
    return (
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <ImageIcon size={48} />
        <p className="text-xs">{att.mime}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-2 text-slate-500">
      <FileText size={48} />
      <p className="text-xs">{att.mime}</p>
    </div>
  );
}
