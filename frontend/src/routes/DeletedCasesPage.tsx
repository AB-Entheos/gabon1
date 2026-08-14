import { Link } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSelector } from "react-redux";
import { useListDeletedCasesQuery, useRestoreCaseMutation } from "@/api/hecApi";
import type { RootState } from "@/store";
import { formatDateTime } from "@/api/format";

export default function DeletedCasesPage() {
  const { t } = useTranslation();
  const lang = useSelector((s: RootState) => s.auth.language);
  const user = useSelector((s: RootState) => s.auth.user);
  const { data, isLoading, refetch } = useListDeletedCasesQuery(undefined, { skip: user?.role !== "SUPER_ADMIN" });
  const [restore, { isLoading: restoring }] = useRestoreCaseMutation();

  if (user?.role !== "SUPER_ADMIN") return <div className="p-6 text-rose-600">{t("common.forbidden", "Access denied.")}</div>;
  if (isLoading) return <div className="p-6 text-slate-500">{t("common.loading", "Loading...")}</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("deleted_cases.title", "Deleted cases")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("deleted_cases.subtitle", "Superadmin-only archive. Deleted cases can be restored to their previous workflow state.")}</p>
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">{t("common.claimant", "Claimant")}</th><th className="px-4 py-3">{t("deleted_cases.deleted_at", "Deleted")}</th><th className="px-4 py-3">{t("deleted_cases.previous_state", "Previous state")}</th><th className="px-4 py-3 text-right">{t("common.actions", "Actions")}</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.results ?? []).map((item) => (
                <tr key={item.uid}>
                  <td className="px-4 py-3"><Link className="font-semibold text-emerald-700 hover:underline" to={`/cases/${item.uid}`}>{item.claimant_name}</Link><div className="font-mono text-xs text-slate-400">{item.uid}</div></td>
                  <td className="px-4 py-3 text-slate-600">{item.deleted_at ? formatDateTime(item.deleted_at, lang) : "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{item.deleted_from_status || "—"} · {item.deleted_from_step ?? "—"}</td>
                  <td className="px-4 py-3 text-right"><button className="btn-secondary" disabled={restoring} onClick={async () => { if (window.confirm(t("deleted_cases.confirm_restore", "Restore this case?"))) { await restore(item.uid).unwrap(); void refetch(); } }}><RotateCcw size={14} />{t("deleted_cases.restore", "Restore")}</button></td>
                </tr>
              ))}
              {(data?.results ?? []).length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t("deleted_cases.empty", "No deleted cases.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
