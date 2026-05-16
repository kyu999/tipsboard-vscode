import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en";
import ja from "./locales/ja";
import { coerceSupportedLanguage, resolveInitialLanguage } from "./languageResolution";
import { FALLBACK_LANGUAGE, LANGUAGE_STORAGE_KEY, supportedLanguages, type SupportedLanguage } from "./supportedLocales";

export { supportedLanguages, type SupportedLanguage };

export function getInitialLanguage(): SupportedLanguage {
  if (typeof window !== "undefined") {
    const storedLanguage = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    return resolveInitialLanguage(storedLanguage, nav, FALLBACK_LANGUAGE);
  }
  return FALLBACK_LANGUAGE;
}

export function getSupportedLanguage(value: string | null | undefined): SupportedLanguage {
  return coerceSupportedLanguage(value, FALLBACK_LANGUAGE);
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
  fallbackLng: FALLBACK_LANGUAGE,
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
