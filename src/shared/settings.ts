import type { ProviderConfig, ProviderId, ReviewSelectionConfig } from "./types";
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

// F7 — provider attivo + configurazione per provider (le chiavi degli altri
// provider restano salvate quando si cambia provider attivo)
export interface ProviderSettings {
  active: ProviderId;
  configs: Partial<Record<ProviderId, ProviderConfig>>;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  anthropic: "claude-opus-4-8",
  openai: "",
  gemini: "",
  azure: "",
};

const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  active: "anthropic",
  configs: {},
};

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const stored = await chrome.storage.local.get("providerSettings");
  const settings = stored["providerSettings"] as Partial<ProviderSettings> | undefined;
  return { ...DEFAULT_PROVIDER_SETTINGS, ...settings };
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  await chrome.storage.local.set({ providerSettings: settings });
}

export function activeProviderConfig(settings: ProviderSettings): ProviderConfig {
  const config = settings.configs[settings.active];
  return {
    apiKey: config?.apiKey ?? "",
    model: config?.model || DEFAULT_MODELS[settings.active],
    endpoint: config?.endpoint,
    deployment: config?.deployment,
  };
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
