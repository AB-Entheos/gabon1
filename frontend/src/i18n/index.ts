import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import fr from "./fr.json";

const SUPPORTED = ["en", "fr"] as const;
type Supported = (typeof SUPPORTED)[number];

function detectInitial(): Supported {
  const stored = localStorage.getItem("hec.lang");
  if (stored === "en" || stored === "fr") return stored;
  // New visitors always start in French; they can switch via the EN/FR toggle.
  localStorage.setItem("hec.lang", "fr");
  return "fr";
}

void i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      fr: { translation: fr },
    },
    lng: detectInitial(),
    fallbackLng: "fr",
    supportedLngs: SUPPORTED as unknown as string[],
    interpolation: { escapeValue: false },
  });

export default i18n;
