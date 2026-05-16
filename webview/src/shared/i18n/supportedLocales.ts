export const supportedLanguages = [
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

export const LANGUAGE_STORAGE_KEY = "tipsboard.language";

/** Used when localStorage is empty and the browser locale is not `en` / `ja`. */
export const FALLBACK_LANGUAGE: SupportedLanguage = "en";
