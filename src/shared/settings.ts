import type { ProviderProfile, ReviewSelectionConfig } from "./types";
import { isSupportedLanguage, resolveDefaultLanguage, type LanguageCode } from "./i18n";

export const DEFAULT_SELECTION_CONFIG: ReviewSelectionConfig = {
  mode: "hybrid",
  numReviews: 50,
  dayRange: 30,
  weights: {
    helpfulness: 0.4,
    playtime: 0.3,
    substance: 0.2,
    freshness: 0.1,
  },
  minChars: 30,
};

export async function loadSelectionConfig(): Promise<ReviewSelectionConfig> {
  const stored = await chrome.storage.local.get("selectionConfig");
  const config = stored["selectionConfig"] as Partial<ReviewSelectionConfig> | undefined;
  return {
    ...DEFAULT_SELECTION_CONFIG,
    ...config,
    weights: { ...DEFAULT_SELECTION_CONFIG.weights, ...config?.weights },
  };
}

export async function saveSelectionConfig(config: ReviewSelectionConfig): Promise<void> {
  await chrome.storage.local.set({ selectionConfig: config });
}

// F7 — profili provider: l'utente ne può definire quanti vuole (stesso
// protocollo, endpoint diversi) e sceglie quello attivo.
export interface ProviderSettings {
  activeProfileId: string;
  profiles: ProviderProfile[];
}

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";

const DEFAULT_PROFILE: ProviderProfile = {
  id: "default-anthropic",
  name: "Anthropic API",
  kind: "anthropic",
  baseUrl: "",
  apiKey: "",
  model: DEFAULT_ANTHROPIC_MODEL,
};

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const stored = await chrome.storage.local.get("providerSettings");
  const settings = stored["providerSettings"] as Partial<ProviderSettings> | undefined;
  if (!settings?.profiles?.length) {
    return { activeProfileId: DEFAULT_PROFILE.id, profiles: [DEFAULT_PROFILE] };
  }
  return {
    activeProfileId: settings.activeProfileId ?? settings.profiles[0]!.id,
    profiles: settings.profiles,
  };
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await chrome.storage.local.set({ providerSettings: settings });
}

export function activeProfile(settings: ProviderSettings): ProviderProfile {
  return (
    settings.profiles.find((p) => p.id === settings.activeProfileId) ??
    settings.profiles[0] ??
    DEFAULT_PROFILE
  );
}

// F6 — durata della cache dei riassunti (0 = disattivata)
export const DEFAULT_CACHE_TTL_HOURS = 24;

export async function loadCacheTtlHours(): Promise<number> {
  const stored = await chrome.storage.local.get("cacheTtlHours");
  const value = stored["cacheTtlHours"];
  return typeof value === "number" && value >= 0 ? value : DEFAULT_CACHE_TTL_HOURS;
}

export async function saveCacheTtlHours(hours: number): Promise<void> {
  await chrome.storage.local.set({ cacheTtlHours: hours });
}

// F9 — preset delle impostazioni di selezione
export type PresetMap = Record<string, ReviewSelectionConfig>;

export async function loadPresets(): Promise<PresetMap> {
  const stored = await chrome.storage.local.get("selectionPresets");
  return (stored["selectionPresets"] as PresetMap | undefined) ?? {};
}

export async function savePresets(presets: PresetMap): Promise<void> {
  await chrome.storage.local.set({ selectionPresets: presets });
}

// F8 — lingua di output/UI
export async function loadLanguage(): Promise<LanguageCode> {
  const stored = await chrome.storage.local.get("language");
  const lang = stored["language"];
  return typeof lang === "string" && isSupportedLanguage(lang)
    ? lang
    : resolveDefaultLanguage();
}

export async function saveLanguage(language: LanguageCode): Promise<void> {
  await chrome.storage.local.set({ language });
}
