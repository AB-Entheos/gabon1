import type { Language } from "@/store/authSlice";

/**
 * Bilingual fallback chain: currentLang → fr → en → raw id.
 * Never returns null/undefined — guarantees no missing-translation crash.
 */
export function bi(
  value: { en: string; fr: string } | string | undefined | null,
  lang: Language,
  fallbackKey = ""
): string {
  if (value == null) return fallbackKey;
  if (typeof value === "string") return value || fallbackKey;
  const v = value[lang] ?? value.fr ?? value.en ?? "";
  return v || fallbackKey;
}

/** Format an integer amount in the locale's number format using FCFA currency. */
export function formatXAF(amount: number | null | undefined, lang: Language): string {
  if (amount == null) return "—";
  try {
    const formatted = new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", {
      style: "currency",
      currency: "XAF",
      maximumFractionDigits: 0,
    }).format(amount);
    // Replace XAF with FCFA for display
    return formatted.replace(/XAF/g, "FCFA");
  } catch {
    return `${amount.toLocaleString()} FCFA`;
  }
}

/** Format a date in the locale's date convention. */
export function formatDate(iso: string | null | undefined, lang: Language): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Format a date+time in the locale. */
export function formatDateTime(iso: string | null | undefined, lang: Language): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
