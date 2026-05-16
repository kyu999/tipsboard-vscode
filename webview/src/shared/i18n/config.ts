import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";

export const supportedLanguages = [
  { code: "ja", label: "日本語" },
  { code: "en", label: "English" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

const LANGUAGE_STORAGE_KEY = "tipsboard.language";
const fallbackLanguage: SupportedLanguage = "ja";

function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return supportedLanguages.some((language) => language.code === value);
}

function getBrowserLanguage(): SupportedLanguage | null {
  if (typeof navigator === "undefined") return null;
  const preferred = navigator.languages?.[0] ?? navigator.language;
  const language = preferred?.split("-")[0];
  return isSupportedLanguage(language) ? language : null;
}

export function getInitialLanguage(): SupportedLanguage {
  if (typeof window !== "undefined") {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isSupportedLanguage(storedLanguage)) return storedLanguage;
  }
  return getBrowserLanguage() ?? fallbackLanguage;
}

export function getSupportedLanguage(value: string | null | undefined): SupportedLanguage {
  return isSupportedLanguage(value) ? value : fallbackLanguage;
}

export async function changeLanguage(language: SupportedLanguage) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }
  await i18n.changeLanguage(language);
}

void i18n.use(initReactI18next).init({
  resources: {
    ja: { translation: ja },
    en: { translation: en },
  },
  lng: getInitialLanguage(),
  fallbackLng: fallbackLanguage,
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

i18n.on("languageChanged", (language) => {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getSupportedLanguage(language);
  }
});

if (typeof document !== "undefined") {
  document.documentElement.lang = getSupportedLanguage(i18n.language);
}

export default i18n;
