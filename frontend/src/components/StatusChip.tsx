import { useTranslation } from "react-i18next";
import type { Language } from "@/store/authSlice";

export function StatusChip({ status, lang: _lang }: { status: string; lang: Language }) {
  const variant: Record<string, string> = {
    DRAFT: "chip-neutral",
    SUBMITTED: "chip-info",
    VERIFIED: "chip-info",
    AT_APPROVAL: "chip-warning",
    APPROVED: "chip-success",
    REJECTED: "chip-error",
    CLOSED: "chip-neutral",
    FIRST_AID_RELEASED: "chip-secondary",
    ACCELERATED_BENEFIT_RELEASED: "chip-secondary",
  };
  const { t } = useTranslation();
  return (
    <span className={`chip ${variant[status] || "chip-neutral"}`}>
      {t(`status.${status}`, status)}
    </span>
  );
}

const ROLE_LABEL_KEY: Record<string, string> = {
  CB: "role.CB",
  AB: "role.AB",
  WCS: "role.WCS",
  DGFC: "role.DGFC",
  DGFAP: "role.DGFAP",
  MINISTER: "role.MINISTER",
  ADMIN: "role.ADMIN",
  SUPER_ADMIN: "role.SUPER_ADMIN",
};

const ROLE_PALETTE: Record<string, string> = {
  CB: "bg-emerald-100 text-emerald-700",
  AB: "bg-blue-100 text-blue-700",
  WCS: "bg-yellow-100 text-yellow-700",
  DGFC: "bg-violet-100 text-violet-700",
  DGFAP: "bg-amber-100 text-amber-700",
  MINISTER: "bg-rose-100 text-rose-700",
  ADMIN: "bg-slate-200 text-slate-700",
  SUPER_ADMIN: "bg-slate-800 text-white",
};

export function RoleBadge({ role }: { role: string }) {
  const { t } = useTranslation();
  return (
    <span className={`chip ${ROLE_PALETTE[role] || "chip-neutral"}`}>
      {t(ROLE_LABEL_KEY[role] || role, role)}
    </span>
  );
}
