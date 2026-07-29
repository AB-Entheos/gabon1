import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ScrollText,
  BarChart3,
  FormInput,
  Wallet,
  ShieldCheck,
  Layers,
  Download,
  Search,
  Plus,
  Trash2,
  Pencil,
  Save,
  X,
  Send,
  Smartphone,
  Building2,
  CheckCircle2,
} from "lucide-react";
import type { Case } from "@/api/hecApi";
import { useListCasesQuery, useListFormsQuery } from "@/api/hecApi";
import {
  listAuditEvents,
  downloadReport,
  listAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  exportPayments,
  pushMobileMoney,
  confirmCasePayment,
  closeCase,
  type AuditEvent,
  type AdminUser,
} from "@/api/hecApi";
import { formatDateTime } from "@/api/format";

export type AdminKind = "audit" | "reports" | "forms" | "payments" | "users" | "stages" | "closed";

const META: Record<
  AdminKind,
  { icon: React.ComponentType<{ size?: number | string; className?: string }>; titleKey: string; subtitleKey: string; color: string; ring: string }
> = {
  audit:    { icon: ScrollText, titleKey: "admin.audit.title",    subtitleKey: "admin.audit.subtitle",    color: "text-slate-700",  ring: "ring-slate-200" },
  reports:  { icon: BarChart3,  titleKey: "admin.reports.title",  subtitleKey: "admin.reports.subtitle",  color: "text-blue-700",   ring: "ring-blue-200" },
  forms:    { icon: FormInput,  titleKey: "admin.forms.title",    subtitleKey: "admin.forms.subtitle",    color: "text-emerald-700",ring: "ring-emerald-200" },
  payments: { icon: Wallet,     titleKey: "admin.payments.title", subtitleKey: "admin.payments.subtitle", color: "text-amber-700",  ring: "ring-amber-200" },
  users:    { icon: ShieldCheck,titleKey: "admin.users.title",    subtitleKey: "admin.users.subtitle",    color: "text-violet-700", ring: "ring-violet-200" },
  stages:   { icon: Layers,     titleKey: "admin.stages.title",   subtitleKey: "admin.stages.subtitle",   color: "text-emerald-700",ring: "ring-emerald-200" },
  closed:   { icon: CheckCircle2,titleKey: "admin.closed.title",   subtitleKey: "admin.closed.subtitle",   color: "text-slate-700",  ring: "ring-slate-300" },
};

export default function AdminPage({ kind }: { kind: AdminKind }) {
  const { t } = useTranslation();
  const meta = META[kind];
  const Icon = meta.icon;

  return (
    <div className="space-y-6">
      <header className="card flex items-start gap-4 p-5">
        <div className={`grid h-12 w-12 place-items-center rounded-lg bg-slate-50 ring-1 ${meta.ring}`}>
          <Icon size={22} className={meta.color} />
        </div>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {t("nav.admin", "Admin")}
          </div>
          <h1 className="mt-1 text-3xl font-bold text-slate-900">{t(meta.titleKey)}</h1>
          <p className="mt-1 text-sm text-slate-500">{t(meta.subtitleKey)}</p>
        </div>
      </header>

      {kind === "audit" && <AuditPanel />}
      {kind === "reports" && <ReportsPanel />}
      {kind === "forms" && <FormsPanel />}
      {kind === "payments" && <PaymentsPanel />}
      {kind === "users" && <UsersPanel />}
      {kind === "stages" && <StagesPanel />}
      {kind === "closed" && <ClosedPanel />}
    </div>
  );
}

/* ----------------------------- AUDIT ----------------------------- */

function AuditPanel() {
  const { t, i18n } = useTranslation();
  const [caseUid, setCaseUid] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [eventType, setEventType] = useState("");
  const [data, setData] = useState<{ results: AuditEvent[]; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await listAuditEvents({
        case_uid: caseUid || undefined,
        actor_email: actorEmail || undefined,
        event_type: eventType || undefined,
      });
      setData(res);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold text-slate-600">{t("audit.filter.case_uid", "Case UID")}</label>
          <input value={caseUid} onChange={(e) => setCaseUid(e.target.value)} className="input" placeholder="uuid…" />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="mb-1 block text-xs font-semibold text-slate-600">{t("audit.filter.actor", "Actor email")}</label>
          <input value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} className="input" placeholder="@hec.local" />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="mb-1 block text-xs font-semibold text-slate-600">{t("audit.filter.event_type", "Event type")}</label>
          <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="input">
            <option value="">—</option>
            <option value="SUBMIT">SUBMIT</option>
            <option value="VERIFY">VERIFY</option>
            <option value="ADVANCE">ADVANCE</option>
            <option value="REJECT">REJECT</option>
            <option value="SET_AMOUNT">SET_AMOUNT</option>
            <option value="FIRST_AID">FIRST_AID</option>
            <option value="COMMENT">COMMENT</option>
            <option value="PAY">PAY</option>
            <option value="CLOSE">CLOSE</option>
          </select>
        </div>
        <button className="btn-primary" onClick={load} disabled={loading}>
          <Search size={16} /> {t("audit.filter.search", "Search")}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {loading && <div className="mt-3 text-slate-500">{t("common.loading", "Loading…")}</div>}

      {data && (
        <>
          <div className="mt-4 text-xs text-slate-500">{data.count} {t("audit.results", "events")}</div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t("table.id", "ID")}</th>
                  <th className="px-3 py-2">{t("table.event", "Event")}</th>
                  <th className="px-3 py-2">{t("table.case", "Case")}</th>
                  <th className="px-3 py-2">{t("table.actor", "Actor")}</th>
                  <th className="px-3 py-2">{t("table.role", "Role")}</th>
                  <th className="px-3 py-2">{t("table.when", "When")}</th>
                  <th className="px-3 py-2">{t("table.notes", "Notes")}</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">#{e.id}</td>
                    <td className="px-3 py-2"><span className="chip bg-blue-100 text-blue-700">{e.event_type}</span></td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">{e.case_uid.slice(0, 8)}…</td>
                    <td className="px-3 py-2">{e.actor_email}</td>
                    <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-700">{e.actor_role}</span></td>
                    <td className="px-3 py-2 text-xs">{formatDateTime(e.occurred_at, i18n.language as "en" | "fr")}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-600">{e.notes}</td>
                  </tr>
                ))}
                {data.results.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">{t("audit.empty", "No events match.")}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

/* ----------------------------- REPORTS ----------------------------- */

function ReportsPanel() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
  const [format, setFormat] = useState<"pdf" | "xlsx">("pdf");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      const blob = await downloadReport({ year, quarter, format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hec-${year}-Q${quarter}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function downloadAnnual() {
    setBusy(true); setError(null);
    try {
      const blob = await downloadReport({ year, format });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hec-${year}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">{t("reports.quarterly.title", "Quarterly report")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("reports.quarterly.subtitle", "Cases reported this quarter, by status, step and amount.")}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("reports.year", "Year")}</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("reports.quarter", "Quarter")}</label>
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className="input">
              <option value={1}>Q1</option>
              <option value={2}>Q2</option>
              <option value={3}>Q3</option>
              <option value={4}>Q4</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("reports.format", "Format")}</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as "pdf" | "xlsx")} className="input">
              <option value="pdf">PDF</option>
              <option value="xlsx">XLSX</option>
            </select>
          </div>
        </div>
        <button className="btn-primary mt-4 w-full" onClick={download} disabled={busy}>
          <Download size={16} />
          {busy ? t("common.loading", "Loading…") : t("reports.download_quarterly", "Download quarterly")}
        </button>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">{t("reports.annual.title", "Annual report")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("reports.annual.subtitle", "Full-year summary across all cases.")}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("reports.year", "Year")}</label>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("reports.format", "Format")}</label>
            <select value={format} onChange={(e) => setFormat(e.target.value as "pdf" | "xlsx")} className="input">
              <option value="pdf">PDF</option>
              <option value="xlsx">XLSX</option>
            </select>
          </div>
        </div>
        <button className="btn-primary mt-4 w-full" onClick={downloadAnnual} disabled={busy}>
          <Download size={16} />
          {busy ? t("common.loading", "Loading…") : t("reports.download_annual", "Download annual")}
        </button>
      </section>

      {error && <div className="md:col-span-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
    </div>
  );
}

/* ----------------------------- FORMS ----------------------------- */

function FormsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, refetch } = useListFormsQuery();

  return (
    <section className="card p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{t("forms.list.title", "Published form definitions")}</h2>
          <p className="mt-1 text-sm text-slate-500">{t("forms.list.subtitle", "JSON-schema forms used at each approval stage. New versions snapshot the previous.")}</p>
        </div>
        <button className="btn-secondary" onClick={() => refetch()}>
          <Save size={16} /> {t("common.refresh", "Refresh")}
        </button>
      </div>

      {isLoading && <div className="mt-4 text-slate-500">{t("common.loading", "Loading…")}</div>}
      {data && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("forms.slug", "Slug")}</th>
                <th className="px-3 py-2">{t("forms.version", "Version")}</th>
                <th className="px-3 py-2">{t("forms.title", "Title")}</th>
                <th className="px-3 py-2">{t("forms.scope", "Role scope")}</th>
                <th className="px-3 py-2">{t("forms.status", "Status")}</th>
                <th className="px-3 py-2">{t("forms.published", "Published")}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((f) => (
                <tr key={f.uid} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{f.slug}</td>
                  <td className="px-3 py-2 font-mono text-xs">v{f.version}</td>
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {typeof f.title === "object" ? (f.title as any).en : f.title}
                  </td>
                  <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-700">{f.role_scope || "—"}</span></td>
                  <td className="px-3 py-2"><span className="chip bg-emerald-100 text-emerald-700">{f.status}</span></td>
                  <td className="px-3 py-2 text-xs text-slate-500">{f.published_at ? new Date(f.published_at).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
              {data.results.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">{t("forms.empty", "No published forms yet.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ----------------------------- PAYMENTS ----------------------------- */

function PaymentsPanel() {
  const { t } = useTranslation();
  const { data: casesData } = useListCasesQuery();
  const approved = (casesData?.results ?? []).filter((c) => c.status === "APPROVED") as Case[];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [selectedUids, setSelectedUids] = useState<string[]>([]);
  const [mobileForm, setMobileForm] = useState<{ case_uid: string; provider: "moov" | "airtel"; phone: string } | null>(null);

  function toggle(uid: string) {
    setSelectedUids((cur) => cur.includes(uid) ? cur.filter((x) => x !== uid) : [...cur, uid]);
  }

  async function exportFile(format: "csv" | "sepa") {
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await exportPayments(format, selectedUids.length ? selectedUids : undefined);
      setInfo(`${format.toUpperCase()} · ${r.rows} rows · sha256=${r.sha256.slice(0, 12)}…`);
      if (r.download_url) window.open(r.download_url, "_blank");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function sendMobile() {
    if (!mobileForm) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await pushMobileMoney(mobileForm);
      setInfo(`${mobileForm.provider.toUpperCase()} → ${r.reference} · ${r.status}`);
      setMobileForm(null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(uid: string) {
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await confirmCasePayment(uid, { proof_reference: "MANUAL-" + Date.now(), channel: "mobile" });
      setInfo(`Confirmed ${uid.slice(0, 8)}… → ${r.status}`);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">{t("payments.export.title", "Export approved disbursements")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("payments.export.subtitle", "Generate a CSV or SEPA file for institutional providers (banks, mobile money operators).")}</p>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => exportFile("csv")} disabled={busy}>
            <Download size={16} /> {t("payments.export.csv", "CSV")}
          </button>
          <button className="btn-secondary" onClick={() => exportFile("sepa")} disabled={busy}>
            <Building2 size={16} /> {t("payments.export.sepa", "SEPA")}
          </button>
          <span className="ml-auto text-xs text-slate-500">{selectedUids.length || approved.length} {t("payments.selected", "selected")}</span>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-base font-semibold text-slate-900">{t("payments.approved.title", "Approved cases")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("payments.approved.subtitle", "Send via mobile money or mark as paid.")}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">{t("table.uid", "UID")}</th>
                <th className="px-3 py-2">{t("table.claimant", "Claimant")}</th>
                <th className="px-3 py-2">{t("table.amount", "Amount")}</th>
                <th className="px-3 py-2 text-right">{t("table.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((c) => (
                <tr key={c.uid} className="border-t border-slate-100">
                  <td className="px-3 py-2"><input type="checkbox" checked={selectedUids.includes(c.uid)} onChange={() => toggle(c.uid)} /></td>
                  <td className="px-3 py-2 font-mono text-xs">{c.uid.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{c.claimant_name}</td>
                  <td className="px-3 py-2 font-mono">{c.amount_authorized ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-secondary mr-1" onClick={() => setMobileForm({ case_uid: c.uid, provider: "moov", phone: c.claimant_phone || "" })}>
                      <Smartphone size={14} /> {t("payments.mobile_btn", "Mobile")}
                    </button>
                    <button className="btn-primary" onClick={() => confirm(c.uid)} disabled={busy}>
                      <CheckCircle2 size={14} /> {t("payments.confirm_btn", "Confirm")}
                    </button>
                  </td>
                </tr>
              ))}
              {approved.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{t("payments.none_approved", "No approved cases awaiting payment.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {mobileForm && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{t("payments.mobile.title", "Send via mobile money")}</h3>
              <button onClick={() => setMobileForm(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t("payments.mobile.provider", "Provider")}</label>
                <select value={mobileForm.provider} onChange={(e) => setMobileForm({ ...mobileForm, provider: e.target.value as "moov" | "airtel" })} className="input">
                  <option value="moov">Moov Money</option>
                  <option value="airtel">Airtel Money</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">{t("payments.mobile.phone", "Recipient phone")}</label>
                <input value={mobileForm.phone} onChange={(e) => setMobileForm({ ...mobileForm, phone: e.target.value })} className="input" />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setMobileForm(null)}>{t("common.cancel", "Cancel")}</button>
              <button className="btn-primary" onClick={sendMobile} disabled={busy}>
                <Send size={14} /> {t("payments.mobile.send", "Send")}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div>}
    </div>
  );
}

/* ----------------------------- USERS ----------------------------- */

const ROLES = ["CB", "DP", "AB", "WCS", "DGFC", "DGFAP", "MINISTER", "ADMIN", "SUPER_ADMIN"] as const;

function UsersPanel() {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ results: AdminUser[]; count: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const res = await listAdminUsers(q || undefined);
      setData(res);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return (
    <section className="card p-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.search", "Search email")}</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input" placeholder="@hec.local" />
        </div>
        <button className="btn-secondary" onClick={load} disabled={loading}>
          <Search size={16} /> {t("users.search_btn", "Search")}
        </button>
        <button className="btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} /> {t("users.add", "Add user")}
        </button>
      </div>

      {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {data && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("table.name", "Name")}</th>
                <th className="px-3 py-2">{t("table.email", "Email")}</th>
                <th className="px-3 py-2">{t("table.role", "Role")}</th>
                <th className="px-3 py-2">{t("table.lang", "Language")}</th>
                <th className="px-3 py-2">{t("table.2fa", "2FA")}</th>
                <th className="px-3 py-2">{t("table.active", "Active")}</th>
                <th className="px-3 py-2 text-right">{t("table.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{u.full_name || u.email}</td>
                  <td className="px-3 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-700">{u.role}</span></td>
                  <td className="px-3 py-2">{u.preferred_language}</td>
                  <td className="px-3 py-2">{u.is_2fa_enabled ? "✓" : "—"}</td>
                  <td className="px-3 py-2">{u.is_active ? "✓" : "✗"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-secondary mr-1" onClick={() => setEditing(u)}>
                      <Pencil size={14} />
                    </button>
                    <button className="btn-danger" onClick={async () => {
                      if (!confirm(t("users.confirm_delete", "Delete this user?"))) return;
                      try { await deleteAdminUser(u.id); await load(); }
                      catch (e) { setError(String((e as Error).message)); }
                    }}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {data.results.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">{t("users.empty", "No users.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editing && <UserEditor user={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </section>
  );
}

function UserEditor({ user, onClose, onSaved }: { user: AdminUser | null; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const isNew = !user;
  const [form, setForm] = useState({
    email: user?.email ?? "",
    first_name: user?.first_name ?? "",
    last_name: user?.last_name ?? "",
    role: user?.role ?? "CB",
    phone: user?.phone ?? "",
    preferred_language: user?.preferred_language ?? "fr",
    is_active: user?.is_active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      const body: any = { ...form };
      if (isNew) await createAdminUser(body);
      else await updateAdminUser(user!.id, body);
      await onSaved();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="card w-full max-w-lg p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">{isNew ? t("users.new", "New user") : t("users.edit", "Edit user")}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.email", "Email")}</label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.first_name", "First name")}</label>
            <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.last_name", "Last name")}</label>
            <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.role", "Role")}</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as any })} className="input">
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.phone", "Phone")}</label>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">{t("users.lang", "Language")}</label>
            <select value={form.preferred_language} onChange={(e) => setForm({ ...form, preferred_language: e.target.value as any })} className="input">
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">{t("users.active", "Active")}</label>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
          </div>
          {isNew && (
            <div className="col-span-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
              {t("users.auto_password_info", "A temporary password will be auto-generated and sent to the user's email. They will be required to change it on first login.")}
            </div>
          )}
        </div>
        {error && <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose}>{t("common.cancel", "Cancel")}</button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            <Save size={14} /> {busy ? t("common.saving", "Saving…") : t("common.save", "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- STAGES ----------------------------- */

function StagesPanel() {
  const { t } = useTranslation();
  const { data: stages } = useListCasesQuery();
  const cases = (stages?.results ?? []) as Case[];

  const buckets = [
    { key: "draft", title: t("status.DRAFT"), statuses: ["DRAFT"], color: "bg-slate-50" },
    { key: "submitted", title: t("status.SUBMITTED"), statuses: ["SUBMITTED"], color: "bg-blue-50" },
    { key: "verified", title: t("status.VERIFIED"), statuses: ["VERIFIED"], color: "bg-cyan-50" },
    { key: "at_approval", title: t("status.AT_APPROVAL"), statuses: ["AT_APPROVAL"], color: "bg-amber-50" },
    { key: "approved", title: t("status.APPROVED"), statuses: ["APPROVED"], color: "bg-emerald-50" },
    { key: "closed", title: t("status.CLOSED"), statuses: ["CLOSED", "REJECTED"], color: "bg-slate-50" },
  ];

  return (
    <section className="card p-5">
      <h2 className="text-base font-semibold text-slate-900">{t("stages.title", "Approval stages overview")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("stages.subtitle", "Cases grouped by current stage.")}</p>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {buckets.map((b) => {
          const items = cases.filter((c) => b.statuses.includes(c.status));
          return (
            <div key={b.key} className={`rounded-lg border border-slate-200 ${b.color} p-3`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">{b.title}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-700">{items.length}</span>
              </div>
              <ul className="mt-3 space-y-1.5">
                {items.slice(0, 5).map((c) => (
                  <li key={c.uid}>
                    <a href={`/cases/${c.uid}`} className="block truncate rounded bg-white px-2 py-1 text-xs text-slate-700 hover:bg-emerald-50">
                      {c.claimant_name}
                    </a>
                  </li>
                ))}
                {items.length === 0 && <li className="text-xs text-slate-400">—</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}


/* ----------------------------- CLOSED ----------------------------- */

function ClosedPanel() {
  const { t, i18n } = useTranslation();
  const { data, refetch, isLoading } = useListCasesQuery();
  const approved = ((data?.results ?? []) as Case[]).filter((c) => c.status === "APPROVED");
  const closed = ((data?.results ?? []) as Case[]).filter((c) => c.status === "CLOSED");
  const [closeTarget, setCloseTarget] = useState<Case | null>(null);
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function confirmClose() {
    if (!closeTarget) return;
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await closeCase(closeTarget.uid, closeNotes || "Marked as closed.");
      setInfo(`Closed ${closeTarget.uid.slice(0, 8)}… → ${r.status}`);
      setCloseTarget(null);
      setCloseNotes("");
      await refetch();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{info}</div>}

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t("closed.ready.title", "Ready to close")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("closed.ready.subtitle", "Cases already approved. Closing confirms the recipient has received the funds and marks the case terminal.")}</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{approved.length}</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("table.uid", "UID")}</th>
                <th className="px-3 py-2">{t("table.claimant", "Claimant")}</th>
                <th className="px-3 py-2">{t("table.type", "Type")}</th>
                <th className="px-3 py-2">{t("table.amount", "Amount (FCFA)")}</th>
                <th className="px-3 py-2 text-right">{t("table.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {approved.map((c) => (
                <tr key={c.uid} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{c.uid.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{c.claimant_name}</td>
                  <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-700">{c.case_type}</span></td>
                  <td className="px-3 py-2 font-mono">{c.amount_authorized ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <button className="btn-primary" onClick={() => { setCloseTarget(c); setCloseNotes(""); }}>
                      <CheckCircle2 size={14} /> {t("closed.mark", "Mark as closed")}
                    </button>
                  </td>
                </tr>
              ))}
              {approved.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">{t("closed.ready.empty", "No approved cases waiting to be closed.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t("closed.archive.title", "Closed cases archive")}</h2>
            <p className="mt-1 text-sm text-slate-500">{t("closed.archive.subtitle", "Terminal — funds disbursed and receipt acknowledged.")}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{closed.length}</span>
        </div>
        {isLoading && <div className="mt-4 text-slate-500">{t("common.loading", "Loading…")}</div>}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">{t("table.uid", "UID")}</th>
                <th className="px-3 py-2">{t("table.claimant", "Claimant")}</th>
                <th className="px-3 py-2">{t("table.type", "Type")}</th>
                <th className="px-3 py-2">{t("table.amount", "Amount (FCFA)")}</th>
                <th className="px-3 py-2">{t("table.first_aid", "First aid")}</th>
                <th className="px-3 py-2">{t("table.reported", "Reported")}</th>
                <th className="px-3 py-2">{t("table.closed_at", "Closed")}</th>
                <th className="px-3 py-2 text-right">{t("table.actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((c) => (
                <tr key={c.uid} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs">{c.uid.slice(0, 8)}…</td>
                  <td className="px-3 py-2 font-medium text-slate-900">{c.claimant_name}</td>
                  <td className="px-3 py-2"><span className="chip bg-slate-100 text-slate-700">{c.case_type}</span></td>
                  <td className="px-3 py-2 font-mono">{c.amount_authorized ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{formatDateTime(c.reported_at, i18n.language as "en" | "fr")}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{(c as { closed_at?: string }).closed_at ? formatDateTime((c as { closed_at?: string }).closed_at!, i18n.language as "en" | "fr") : "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <a className="btn-secondary" href={`/cases/${c.uid}`}>{t("common.view", "View")}</a>
                  </td>
                </tr>
              ))}
              {closed.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">{t("closed.archive.empty", "No closed cases yet.")}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {closeTarget && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
          <div className="card w-full max-w-md p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{t("closed.modal.title", "Close case")}</h3>
              <button onClick={() => setCloseTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              {t("closed.modal.body", "This will mark")} <span className="font-mono">{closeTarget.uid.slice(0, 8)}…</span>{" "}
              ({closeTarget.claimant_name}) <span className="font-semibold">{t("closed.modal.terminal", "as terminal (CLOSED).")}</span>{" "}
              {t("closed.modal.warning", "No further transitions will be allowed.")}
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-xs font-semibold text-slate-600">{t("closed.modal.notes", "Closing notes (optional)")}</label>
              <textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} className="input min-h-[80px]" placeholder="Receipt reference, claimant confirmation, etc." />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setCloseTarget(null)}>{t("common.cancel", "Cancel")}</button>
              <button className="btn-primary" onClick={confirmClose} disabled={busy}>
                <CheckCircle2 size={14} /> {busy ? t("common.loading", "Loading…") : t("closed.modal.confirm", "Confirm close")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

