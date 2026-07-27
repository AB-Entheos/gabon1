import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FileText, Download } from "lucide-react";
import { useListSubmissionsQuery } from "@/api/hecApi";
import { formatDateTime } from "@/api/format";
import type { Language } from "@/store/authSlice";

interface Props {
  caseUid: string;
  lang: Language;
}

export default function CaseFilesGallery({ caseUid, lang }: Props) {
  const { t } = useTranslation();
  const { data, isLoading } = useListSubmissionsQuery({ uid: caseUid, includeBag: true }, { skip: !caseUid });

  const files = useMemo(() => {
    if (!data) return [] as any[];
    const out: any[] = [];
    for (const s of data.results) {
      for (const a of s.attachments) {
        out.push({
          id: a.id,
          filename: a.filename,
          mime: a.mime,
          size: a.size_bytes,
          submission_at: s.submitted_at,
          file_type: a.file_type,
        });
      }
    }
    return out;
  }, [data]);

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{t("case.files.title", "Case files")}</h3>
          <p className="mt-1 text-sm text-slate-500">{t("case.files.subtitle", "Supporting material uploaded to this case.")}</p>
        </div>
        <span className="text-xs text-slate-500">{files.length} {t("case.gallery.files", "files")}</span>
      </div>

      {isLoading && <div className="mt-4 text-slate-500">{t("common.loading", "Loading…")}</div>}

      {!isLoading && files.length === 0 && (
        <p className="mt-4 text-sm text-slate-500">{t("case.files.empty", "No case files yet.")}</p>
      )}

      {files.length > 0 && (
        <div className="mt-4 -mx-3 overflow-x-auto py-2">
          <div className="flex gap-3 px-3">
            {files.map((f) => (
              <div key={f.id} className="min-w-[180px] max-w-xs flex-shrink-0">
                <div className="flex h-28 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="text-slate-500" />
                    <div className="truncate text-sm font-medium" title={f.filename}>{f.filename}</div>
                  </div>
                  {f.file_type && (
                    <div className="mt-1 text-xs text-slate-500">
                      {t("case.files.type", "Type")} : {f.file_type.replace(/_/g, " ")}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                    <span>{formatDateTime(f.submission_at, lang)}</span>
                    <span>{(f.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <a href={`#/`} onClick={(e) => e.preventDefault()} className="text-xs text-slate-600 hover:text-emerald-600">
                      <Download size={14} /> {t("case.gallery.download", "Download")}
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
