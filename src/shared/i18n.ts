// F8 — la lingua governa solo l'output (riassunto) e la UI.
export type LanguageCode = "it" | "en" | "es" | "fr" | "de";

export const SUPPORTED_LANGUAGES: LanguageCode[] = ["it", "en", "es", "fr", "de"];

// Nome della lingua da usare nel prompt ("rispondi in ...")
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  it: "italiano",
  en: "English",
  es: "español",
  fr: "français",
  de: "Deutsch",
};

export function isSupportedLanguage(code: string): code is LanguageCode {
  return (SUPPORTED_LANGUAGES as string[]).includes(code);
}

// Default: lingua del browser se tra le 5, altrimenti inglese
export function resolveDefaultLanguage(): LanguageCode {
  const browser = chrome.i18n.getUILanguage().slice(0, 2).toLowerCase();
  return isSupportedLanguage(browser) ? browser : "en";
}
