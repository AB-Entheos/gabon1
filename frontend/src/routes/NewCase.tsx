import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FilePlus, ChevronRight } from "lucide-react";
import { useCreateCaseMutation } from "@/api/hecApi";
import { useLocalState } from "@/hooks/useLocalState";

interface Draft {
  caseType: "MEDICAL" | "BURIAL";
  name: string;
  phone: string;
  idNumber: string;
  idType: "NATIONAL_ID" | "PASSPORT" | "DRIVER_LICENSE" | "OTHER";
  dateOfBirth: string;
  gender: "M" | "F" | "OTHER" | "";
  address: string;
  incidentLocation: string;
  relationship: "SELF" | "SPOUSE" | "PARENT" | "CHILD" | "SIBLING" | "OTHER";
  incidentAt: string;
  villageNameText: string;
  chefDeVillage: string;
}

const defaultIncidentAt = () => {
  const d = new Date();
  d.setHours(d.getHours() - 6);
  return d.toISOString().slice(0, 16);
};

const blankDraft: Draft = {
  caseType: "MEDICAL",
  name: "",
  phone: "",
  idNumber: "",
  idType: "NATIONAL_ID",
  dateOfBirth: "",
  gender: "",
  address: "",
  incidentLocation: "",
  relationship: "SELF",
  incidentAt: defaultIncidentAt(),
  villageNameText: "",
  chefDeVillage: "",
};

export default function NewCase() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [createCase, { isLoading }] = useCreateCaseMutation();
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useLocalState<Draft>("new-case-draft", blankDraft);
  const { caseType, name, phone, idNumber, idType, dateOfBirth, gender, address, incidentLocation, relationship, incidentAt, villageNameText, chefDeVillage } = draft;
  const setCaseType = (v: "MEDICAL" | "BURIAL") => setDraft((d) => ({ ...d, caseType: v }));
  const setName = (v: string) => setDraft((d) => ({ ...d, name: v }));
  const setPhone = (v: string) => setDraft((d) => ({ ...d, phone: v }));
  const setIdNumber = (v: string) => setDraft((d) => ({ ...d, idNumber: v }));
  const setIdType = (v: "NATIONAL_ID" | "PASSPORT" | "DRIVER_LICENSE" | "OTHER") => setDraft((d) => ({ ...d, idType: v }));
  const setDateOfBirth = (v: string) => setDraft((d) => ({ ...d, dateOfBirth: v }));
  const setGender = (v: "M" | "F" | "OTHER" | "") => setDraft((d) => ({ ...d, gender: v }));
  const setAddress = (v: string) => setDraft((d) => ({ ...d, address: v }));
  const setIncidentLocation = (v: string) => setDraft((d) => ({ ...d, incidentLocation: v }));
  const setRelationship = (v: "SELF" | "SPOUSE" | "PARENT" | "CHILD" | "SIBLING" | "OTHER") => setDraft((d) => ({ ...d, relationship: v }));
  const setIncidentAt = (v: string) => setDraft((d) => ({ ...d, incidentAt: v }));
  const setVillageNameText = (v: string) => setDraft((d) => ({ ...d, villageNameText: v }));
  const setChefDeVillage = (v: string) => setDraft((d) => ({ ...d, chefDeVillage: v }));

  // Crop-damage intake was removed; only medical and burial remain.

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await createCase({
        case_type: caseType,
        claimant_name: name,
        claimant_phone: phone,
        claimant_id_number: idNumber,
        claimant_id_type: idType,
        claimant_date_of_birth: dateOfBirth || null,
        claimant_gender: gender || null,
        claimant_address: address,
        incident_location: incidentLocation,
        relationship_to_claimant: relationship,
        incident_at: new Date(incidentAt).toISOString(),
        village_name_text: villageNameText.trim(),
        chef_de_village: chefDeVillage.trim(),
      } as any).unwrap();
      // Reset the draft now that the case exists on the server.
      setDraft(blankDraft);
      navigate(`/cases/${c.uid}`);
    } catch (e: any) {
      setError(e?.data?.detail || String(e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">CB</div>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{t("new_case.title", "New case")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t("new_case.subtitle", "Create a draft case. The incident form is filled in next.")}
        </p>
      </header>

      <form onSubmit={onSubmit} className="card space-y-5 p-6">
        <Field label={t("new_case.type", "Case type")}>
          <div className="grid grid-cols-2 gap-3">
            {(["MEDICAL", "BURIAL"] as const).map((ct) => (
              <button
                key={ct}
                type="button"
                onClick={() => setCaseType(ct)}
                className={
                  caseType === ct
                    ? "rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
                    : "rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm text-slate-600 hover:border-slate-400"
                }
              >
                {ct === "MEDICAL"
                  ? t("case_type.medical", "Medical (injury)")
                  : t("case_type.burial", "Burial (death)")}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t("new_case.claimant_name", "Claimant full name")} required>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className="input" />
        </Field>

        <Field label={t("new_case.claimant_phone", "Claimant phone")} required>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required className="input" />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("new_case.id_type", "ID type")} required>
            <select value={idType} onChange={(e) => setIdType(e.target.value as any)} className="input">
              <option value="NATIONAL_ID">{t("id_type.national_id", "National ID")}</option>
              <option value="PASSPORT">{t("id_type.passport", "Passport")}</option>
              <option value="DRIVER_LICENSE">{t("id_type.driver_license", "Driver License")}</option>
              <option value="OTHER">{t("id_type.other", "Other")}</option>
            </select>
          </Field>

          <Field label={t("new_case.id_number", "ID number")} required>
            <input type="text" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required className="input" />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("new_case.date_of_birth", "Date of birth")}>
            <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} className="input" />
          </Field>

          <Field label={t("new_case.gender", "Gender")}>
            <select value={gender} onChange={(e) => setGender(e.target.value as any)} className="input">
              <option value="">{t("gender.select", "Select…")}</option>
              <option value="M">{t("gender.male", "Male")}</option>
              <option value="F">{t("gender.female", "Female")}</option>
              <option value="OTHER">{t("gender.other", "Other")}</option>
            </select>
          </Field>
        </div>

        <Field label={t("new_case.address", "Address")}>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="input" placeholder={t("new_case.address_placeholder", "Full address of the claimant")} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={t("new_case.village_name_text", "Village name")} required>
            <input
              type="text"
              value={villageNameText}
              onChange={(e) => setVillageNameText(e.target.value)}
              required
              className="input"
              placeholder={t("new_case.village_name_placeholder", "Name of the village where the incident occurred")}
            />
          </Field>

          <Field label={t("new_case.chef_de_village", "Chef de village")}>
            <input
              type="text"
              value={chefDeVillage}
              onChange={(e) => setChefDeVillage(e.target.value)}
              className="input"
              placeholder={t("new_case.chef_de_village_placeholder", "Full name of the village chief")}
            />
          </Field>
        </div>

        <Field label={t("new_case.incident_location", "Incident location")} required>
          <input type="text" value={incidentLocation} onChange={(e) => setIncidentLocation(e.target.value)} required className="input" placeholder={t("new_case.incident_location_placeholder", "Where did the incident occur?")} />
        </Field>

        <Field label={t("new_case.relationship", "Relationship to claimant")}>
          <select value={relationship} onChange={(e) => setRelationship(e.target.value as any)} className="input">
            <option value="SELF">{t("relationship.self", "Self")}</option>
            <option value="SPOUSE">{t("relationship.spouse", "Spouse")}</option>
            <option value="PARENT">{t("relationship.parent", "Parent")}</option>
            <option value="CHILD">{t("relationship.child", "Child")}</option>
            <option value="SIBLING">{t("relationship.sibling", "Sibling")}</option>
            <option value="OTHER">{t("relationship.other", "Other")}</option>
          </select>
        </Field>

        <Field label={t("new_case.incident_at", "Incident date & time")} required>
          <input type="datetime-local" value={incidentAt} onChange={(e) => setIncidentAt(e.target.value)} required className="input" />
        </Field>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={isLoading || !name || !phone}
            className="btn-primary"
          >
            <FilePlus size={16} />
            {isLoading ? t("common.creating", "Creating…") : t("new_case.create", "Create draft")}
            <ChevronRight size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </label>
      {children}
    </div>
  );
}
