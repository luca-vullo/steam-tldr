// F8 — the selected language governs output (summary) and UI.
// chrome.i18n.getMessage always follows the BROWSER locale, so it cannot honor
// the user's language setting: the UI uses this runtime layer instead. The
// _locales files remain the single source of truth (they are bundled here and
// still serve the manifest's __MSG_*__ placeholders).
import en from "../../_locales/en/messages.json";
import it from "../../_locales/it/messages.json";
import es from "../../_locales/es/messages.json";
import fr from "../../_locales/fr/messages.json";
import de from "../../_locales/de/messages.json";

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

type MessageMap = Record<string, { message: string }>;

const MESSAGES: Record<LanguageCode, MessageMap> = { en, it, es, fr, de };

let activeLanguage: LanguageCode = "en";

export function initI18n(language: LanguageCode): void {
  activeLanguage = language;
}

// Same substitution convention as chrome.i18n: $1..$9
export function t(key: string, subs?: string[]): string {
  const entry = MESSAGES[activeLanguage][key] ?? MESSAGES.en[key];
  let text = entry?.message ?? key;
  if (subs) {
    subs.forEach((value, i) => {
      text = text.replace(`$${i + 1}`, value);
    });
  }
  return text;
}

export function isSupportedLanguage(code: string): code is LanguageCode {
  return (SUPPORTED_LANGUAGES as string[]).includes(code);
}

// Default: the browser language if among the 5, otherwise English
export function resolveDefaultLanguage(): LanguageCode {
  const browser = chrome.i18n.getUILanguage().slice(0, 2).toLowerCase();
  return isSupportedLanguage(browser) ? browser : "en";
}
