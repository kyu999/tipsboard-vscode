import type { SupportedLanguage } from "./supportedLocales";
import { supportedLanguages } from "./supportedLocales";

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return supportedLanguages.some((language) => language.code === value);
}

export type NavigatorLanguageSource = {
  languages?: readonly string[];
  language?: string;
};

/**
 * Resolves the UI language: saved value wins, then the browser primary locale if supported, else fallback.
 */
export function resolveInitialLanguage(
  stored: string | null | undefined,
  navigatorLike: NavigatorLanguageSource | undefined,
  fallback: SupportedLanguage,
): SupportedLanguage {
  if (isSupportedLanguage(stored)) return stored;
  const preferred = navigatorLike?.languages?.[0] ?? navigatorLike?.language;
  const primary = preferred?.split("-")[0];
  if (isSupportedLanguage(primary)) return primary;
  return fallback;
}

export function coerceSupportedLanguage(value: string | null | undefined, fallback: SupportedLanguage): SupportedLanguage {
  return isSupportedLanguage(value) ? value : fallback;
}
