import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FormDefinition } from "@/api/hecApi";
import { bi } from "@/api/format";
import type { Language } from "@/store/authSlice";
import SignaturePad from "./SignaturePad";
import FileUploader from "./FileUploader";

interface Props {
  form: FormDefinition;
  caseUid: string;
  lang: Language;
  onSubmit: (payload: Record<string, unknown>) => Promise<void> | void;
  submitting?: boolean;
  /** Pre-populate fields with these values (e.g. from the existing Case). */
  initialValues?: Record<string, unknown>;
  /** Field ids that should render as read-only (locked to the case). */
  readOnlyFields?: string[];
}

export default function FormRenderer({
  form,
  caseUid,
  lang,
  onSubmit,
  submitting,
  initialValues,
  readOnlyFields,
}: Props) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const f of form.schema.fields) {
      if (initialValues && initialValues[f.id] !== undefined) {
        init[f.id] = initialValues[f.id];
      } else if (f.default !== undefined) {
        init[f.id] = f.default;
      }
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function setValue(id: string, v: unknown) {
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  function isVisible(field: any): boolean {
    const sw = field.show_when;
    if (sw && typeof sw === "object") {
      const ctrl = values[sw.field];
      if (ctrl !== sw.equals) return false;
    }
    return true;
  }

  function isRequired(field: any): boolean {
    const rw = field.required_when;
    if (rw && typeof rw === "object") {
      const ctrl = values[rw.field];
      if (ctrl === rw.equals) return true;
    }
    return !!field.required;
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    for (const f of form.schema.fields) {
      if (!isVisible(f)) continue;
      if (isRequired(f)) {
        const v = values[f.id];
        if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
          e[f.id] = t("form.required", "Required");
        }
      }
      if (f.type === "number" && values[f.id] != null && values[f.id] !== "") {
        const n = Number(values[f.id]);
        if (Number.isNaN(n)) e[f.id] = t("form.invalid_number", "Must be a number");
        if (typeof f.min === "number" && n < f.min)
          e[f.id] = t("form.min", "Must be >= {min}").replace("{min}", String(f.min));
        if (typeof f.max === "number" && n > f.max)
          e[f.id] = t("form.max", "Must be <= {max}").replace("{max}", String(f.max));
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(values);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {form.schema.title && (
        <div>
          <h2 className="text-xl font-bold text-slate-900">{bi(form.schema.title, lang, form.slug)}</h2>
          {form.schema.description && (
            <p className="mt-1 text-sm text-slate-500">
              {bi(form.schema.description, lang)}
            </p>
          )}
        </div>
      )}

      {form.schema.fields.map((field) => {
        if (!isVisible(field)) return null;
        const id = field.id;
        const ftype = field.type;
        const label = bi(field.label, lang, id);
        const help = bi(field.help, lang);
        const err = errors[id];
        const required = isRequired(field);
        const readOnly = readOnlyFields?.includes(id) ?? false;
        const lockedCls = readOnly
          ? "w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-600"
          : "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

        if (ftype === "section") {
          return <h3 key={id} className="mt-4 text-base font-semibold text-slate-900">{label}</h3>;
        }
        if (ftype === "static") {
          return <p key={id} className="text-sm text-slate-500">{label}</p>;
        }
        if (ftype === "signature") {
          return (
            <div key={id}>
              <SignaturePad value={(values[id] as string) ?? ""} onChange={(v) => setValue(id, v)} required={required} />
              {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
            </div>
          );
        }
        if (ftype === "file") {
          return (
            <div key={id}>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                {label}{required && <span className="ml-1 text-rose-600">*</span>}
              </label>
              {help && <p className="mb-2 text-xs text-slate-500">{help}</p>}
              <FileUploader caseUid={caseUid} accept="image/*,application/pdf" capture="environment" />
              {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
            </div>
          );
        }

        return (
          <div key={id}>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor={id}>
              {label}{required && <span className="ml-1 text-rose-600">*</span>}
              {readOnly && (
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  {t("form.locked", "Locked from case")}
                </span>
              )}
            </label>
            {help && <p className="mb-2 text-xs text-slate-500">{help}</p>}

            {ftype === "text" || ftype === "tel" || ftype === "email" || ftype === "date" || ftype === "time" || ftype === "datetime" ? (
              <input
                id={id}
                type={ftype === "tel" ? "tel" : ftype === "email" ? "email" : ftype === "date" ? "date" : ftype === "time" ? "time" : ftype === "datetime" ? "datetime-local" : "text"}
                value={(values[id] as string) ?? ""}
                onChange={(e) => setValue(id, e.target.value)}
                disabled={readOnly}
                className={lockedCls}
              />
            ) : ftype === "number" ? (
              <input
                id={id}
                type="number"
                value={(values[id] as string | number) ?? ""}
                onChange={(e) => setValue(id, e.target.value === "" ? "" : Number(e.target.value))}
                min={field.min}
                max={field.max}
                disabled={readOnly}
                className={lockedCls}
              />
            ) : ftype === "textarea" ? (
              <textarea
                id={id}
                rows={3}
                value={(values[id] as string) ?? ""}
                onChange={(e) => setValue(id, e.target.value)}
                disabled={readOnly}
                className={lockedCls}
              />
            ) : ftype === "select" ? (
              <select
                id={id}
                value={(values[id] as string) ?? ""}
                onChange={(e) => setValue(id, e.target.value)}
                disabled={readOnly}
                className={lockedCls}
              >
                <option value="" disabled>—</option>
                {(field.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>{bi(o.label, lang, o.value)}</option>
                ))}
              </select>
            ) : ftype === "multiselect" ? (
              <div className="space-y-1">
                {(field.options ?? []).map((o) => {
                  const arr = (values[id] as string[]) ?? [];
                  const checked = arr.includes(o.value);
                  return (
                    <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setValue(id, checked ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      {bi(o.label, lang, o.value)}
                    </label>
                  );
                })}
              </div>
            ) : ftype === "radio" ? (
              <div className="space-y-1">
                {(field.options ?? []).map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      name={id}
                      value={o.value}
                      checked={values[id] === o.value}
                      onChange={() => setValue(id, o.value)}
                      className="h-4 w-4 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    {bi(o.label, lang, o.value)}
                  </label>
                ))}
              </div>
            ) : ftype === "checkbox" ? (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={Boolean(values[id])}
                  onChange={(e) => setValue(id, e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                {label}
              </label>
            ) : null}

            {err && <p className="mt-1 text-xs text-rose-600">{err}</p>}
          </div>
        );
      })}

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? t("common.submitting", "Submitting…") : t("common.submit", "Submit")}
        </button>
      </div>
    </form>
  );
}
