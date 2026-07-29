import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { Upload, X, Camera, Send, CheckCircle2, Image as ImageIcon, FileText } from "lucide-react";
import { usePresignUploadMutation, useFinishUploadMutation } from "@/api/hecApi";
import { enqueueUpload, isOnline } from "@/offline/queue";
import type { RootState } from "@/store";

interface Props {
  caseUid: string;
  submissionId?: number;
  onUploaded?: (key: string, fileType?: string) => void;
  accept?: string;
  capture?: "environment" | "user" | "";
  label?: string;
  showTypeInput?: boolean;
  fixedFileType?: string;
  description?: string;
  uploadedByName?: string;
  showMetadataForm?: boolean;
  requireSubmit?: boolean;
  attachToCase?: boolean;
  multiple?: boolean;
}

interface PendingFile {
  id: string;
  file: File;
  description: string;
  fileTypeOverride: string;
}

interface UploadedFile {
  key: string;
  filename: string;
  size: number;
  mime?: string;
  fileType?: string;
  previewUrl?: string;
}

export default function FileUploader({
  caseUid,
  submissionId,
  onUploaded,
  accept = "image/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/csv,.csv,application/vnd.ms-excel,text/plain,.txt",
  capture = "",
  label,
  showTypeInput = false,
  fixedFileType,
  description,
  uploadedByName,
  showMetadataForm = true,
  requireSubmit = true,
  attachToCase = false,
  multiple = true,
}: Props) {
  const { t } = useTranslation();
  const user = useSelector((s: RootState) => s.auth.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fileType, setFileType] = useState<string>("");
  const [docDescription, setDocDescription] = useState<string>(description ?? "");

  const defaultUploaderName = useMemo(() => {
    if (uploadedByName) return uploadedByName;
    if (!user) return "";
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
    return fullName || user.email;
  }, [user, uploadedByName]);
  const [uploaderName, setUploaderName] = useState<string>(defaultUploaderName);
  useEffect(() => {
    setUploaderName(defaultUploaderName);
  }, [defaultUploaderName]);

  const selectedFileType = fixedFileType || fileType || undefined;
  const [presign] = usePresignUploadMutation();
  const [finish] = useFinishUploadMutation();

  function addPending(list: FileList | null) {
    if (!list) return;
    const out: PendingFile[] = [];
    for (const file of Array.from(list)) {
      out.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
        file,
        description: docDescription,
        fileTypeOverride: selectedFileType ?? "",
      });
    }
    setPending((prev) => [...prev, ...out]);
    if (!requireSubmit && out.length > 0) {
      for (const p of out) {
        void doUpload({
          file: p.file,
          description: p.description,
          fileType: p.fileTypeOverride || selectedFileType,
        });
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    addPending(e.target.files);
  }

  function removePending(id: string) {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }

  async function doUpload(args: { file: File; description: string; fileType: string | undefined }) {
    const { file, description, fileType: ft } = args;
    setError(null);
    setProgress(0);

    if (!isOnline()) {
      const buf = await file.arrayBuffer();
      await enqueueUpload({
        caseUid,
        submissionId: attachToCase ? undefined : submissionId,
        caseUidForSynthetic: attachToCase ? caseUid : undefined,
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        data: buf,
        fileType: ft,
        description: description.trim() || undefined,
        uploadedByName: uploaderName.trim() || undefined,
      });
      setProgress(100);
      setError(t("upload.queued", "Queued (offline). Will sync when online."));
      setFiles((prev) => [
        ...prev,
        {
          key: `pending:${Date.now()}-${file.name}`,
          filename: file.name,
          size: file.size,
          fileType: ft,
          mime: file.type,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        },
      ]);
      return;
    }

    try {
      const presigned = await presign({
        filename: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        case_uid: caseUid,
        submission_id: attachToCase ? undefined : submissionId,
        file_type: ft,
        description: description.trim(),
        uploaded_by_name: uploaderName.trim(),
      } as any).unwrap();

      setProgress(25);
      const put = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!put.ok) throw new Error(`PUT failed: ${put.status}`);
      setProgress(75);

      const buf = await file.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", buf);
      const sha = Array.from(new Uint8Array(hash))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const finished = await finish({
        key: presigned.key,
        filename: file.name,
        mime: file.type,
        size: file.size,
        sha256: sha,
        submission_id: attachToCase ? undefined : submissionId,
        case_uid: attachToCase ? caseUid : undefined,
        file_type: ft,
        description: description.trim(),
        uploaded_by_name: uploaderName.trim(),
      } as any).unwrap();
      setProgress(100);
      setFiles((prev) => [
        ...prev,
        {
          key: finished.key,
          filename: file.name,
          size: file.size,
          fileType: ft,
          mime: file.type,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        },
      ]);
      onUploaded?.(finished.key, ft);
    } catch (err) {
      setError(String(err));
      setProgress(null);
    } finally {
      setProgress(null);
    }
  }

  async function submitAll() {
    if (pending.length === 0) return;
    setProgress(0);
    const snapshot = [...pending];
    for (const p of snapshot) {
      await doUpload({
        file: p.file,
        description: p.description || docDescription,
        fileType: p.fileTypeOverride || selectedFileType,
      });
    }
    setPending([]);
    setProgress(null);
  }

  function clearAll() {
    setPending([]);
    setError(null);
  }

  return (
    <div className="space-y-2">
      <div
        onClick={() => fileRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:border-emerald-500 hover:bg-emerald-50/40"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          {capture ? <Camera size={20} /> : <Upload size={20} />}
        </div>
        <p className="text-sm font-medium text-slate-700">
          {label || t("upload.cta", "Click or drop files to upload")}
        </p>
        <p className="text-xs text-slate-500">
          {accept} · 25 MB max · {t("upload.many", "Select 1 or more files")}
        </p>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          multiple={multiple}
          {...(capture ? { capture } : {})}
          onChange={onPick}
          className="hidden"
        />
      </div>

      {showMetadataForm && (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("upload.description_label", "Description / alt text")}
            </label>
            <input
              type="text"
              value={docDescription}
              onChange={(e) => setDocDescription(e.target.value)}
              placeholder={t("upload.description_placeholder", "What does this document show?")}
              className="input"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">
              {t("upload.uploader_label", "Uploaded by")}
            </label>
            <input
              type="text"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder={t("upload.uploader_placeholder", "e.g. CB Jean Mboumba")}
              className="input"
            />
          </div>
        </div>
      )}

      {requireSubmit && pending.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
            {t("upload.queued_n", "Ready to upload ({n} file)").replace("{n}", String(pending.length))}
          </div>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs"
              >
                {p.file.type.startsWith("image/") ? (
                  <img
                    src={URL.createObjectURL(p.file)}
                    alt={p.file.name}
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <FileText size={20} className="shrink-0 text-slate-400" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={p.file.name}>{p.file.name}</div>
                  <div className="text-[10px] text-slate-500">{(p.file.size / 1024).toFixed(1)} KB</div>
                </div>
                <button
                  type="button"
                  onClick={() => removePending(p.id)}
                  className="text-slate-400 hover:text-rose-600"
                  title={t("common.cancel", "Cancel")}
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={clearAll}
              disabled={progress !== null}
            >
              <X size={14} /> {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={submitAll}
              disabled={progress !== null}
            >
              <Send size={14} /> {t("upload.submit_button", "Submit")} ({pending.length})
            </button>
          </div>
        </div>
      )}

      {showTypeInput && (
        <div className="mt-2">
          <label className="mb-1 block text-xs font-medium text-slate-500">{t("upload.file_type", "File type (optional)")}</label>
          <input
            type="text"
            value={fileType}
            onChange={(e) => setFileType(e.target.value)}
            placeholder={t("upload.file_type_placeholder", "e.g. ambulance receipt")}
            className="input"
          />
        </div>
      )}

      {progress !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-emerald-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((f) => (
            <li
              key={f.key}
              className="overflow-hidden rounded-lg border border-slate-200 bg-white"
            >
              <div className="flex aspect-square items-center justify-center bg-slate-50">
                {f.previewUrl ? (
                  <img
                    src={f.previewUrl}
                    alt={f.filename}
                    className="h-full w-full object-cover"
                  />
                ) : f.mime?.startsWith("image/") ? (
                  <ImageIcon size={28} className="text-slate-400" />
                ) : (
                  <FileText size={28} className="text-slate-400" />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200 px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={f.filename}>{f.filename}</div>
                  <div className="text-[10px] text-slate-500">
                    {(f.size / 1024).toFixed(1)} KB
                    {f.fileType ? ` · ${f.fileType}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <button
                    type="button"
                    onClick={() => setFiles((prev) => prev.filter((x) => x.key !== f.key))}
                    className="text-slate-500 hover:text-rose-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}