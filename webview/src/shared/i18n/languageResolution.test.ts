import { describe, expect, it } from "vitest";
import { coerceSupportedLanguage, isSupportedLanguage, resolveInitialLanguage } from "./languageResolution";
import { FALLBACK_LANGUAGE } from "./supportedLocales";

describe("isSupportedLanguage", () => {
  it("accepts en and ja", () => {
    expect(isSupportedLanguage("en")).toBe(true);
    expect(isSupportedLanguage("ja")).toBe(true);
  });

  it("rejects other values", () => {
    expect(isSupportedLanguage("fr")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
    expect(isSupportedLanguage(null)).toBe(false);
    expect(isSupportedLanguage(undefined)).toBe(false);
  });
});

describe("coerceSupportedLanguage", () => {
  it("returns the value when supported", () => {
    expect(coerceSupportedLanguage("ja", FALLBACK_LANGUAGE)).toBe("ja");
    expect(coerceSupportedLanguage("en", FALLBACK_LANGUAGE)).toBe("en");
  });

  it("returns fallback when unsupported", () => {
    expect(coerceSupportedLanguage("zh", FALLBACK_LANGUAGE)).toBe("en");
    expect(coerceSupportedLanguage(null, FALLBACK_LANGUAGE)).toBe("en");
  });
});

describe("resolveInitialLanguage", () => {
  it("prefers a valid stored language over browser", () => {
    expect(resolveInitialLanguage("ja", { language: "en-US" }, FALLBACK_LANGUAGE)).toBe("ja");
    expect(resolveInitialLanguage("en", { language: "ja" }, FALLBACK_LANGUAGE)).toBe("en");
  });

  it("ignores invalid stored and uses browser primary", () => {
    expect(resolveInitialLanguage("xx", { language: "ja-JP" }, FALLBACK_LANGUAGE)).toBe("ja");
    expect(resolveInitialLanguage("bad", { languages: ["en-GB"] }, FALLBACK_LANGUAGE)).toBe("en");
  });

  it("uses navigator.languages[0] when present", () => {
    expect(
      resolveInitialLanguage(null, { languages: ["ja-JP", "en-US"], language: "en-US" }, FALLBACK_LANGUAGE),
    ).toBe("ja");
  });

  it("falls back when browser locale is not supported", () => {
    expect(resolveInitialLanguage(null, { language: "fr-FR" }, FALLBACK_LANGUAGE)).toBe("en");
    expect(resolveInitialLanguage(null, { languages: ["de"] }, FALLBACK_LANGUAGE)).toBe("en");
  });

  it("falls back when storage empty and navigator missing", () => {
    expect(resolveInitialLanguage(null, undefined, FALLBACK_LANGUAGE)).toBe("en");
  });
});
