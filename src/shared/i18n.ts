// F8 — the selected language governs output (summary) and UI only.
export type LanguageCode = "it" | "en" | "es" | "fr" | "de";

export const SUPPORTED_LANGUAGES: LanguageCode[] = ["it", "en", "es", "fr", "de"];

// Language name used in the prompt ("answer in ...")
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  it: "Italian",
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
};

export function isSupportedLanguage(code: string): code is LanguageCode {
  return (SUPPORTED_LANGUAGES as string[]).includes(code);
}

// Default: the browser language if among the 5, otherwise English
export function resolveDefaultLanguage(): LanguageCode {
  const browser = chrome.i18n.getUILanguage().slice(0, 2).toLowerCase();
  return isSupportedLanguage(browser) ? browser : "en";
}
