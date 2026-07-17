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
  minPlaytimeHours: 0, // off by default: opt-in anti-meme filter
};

// Stored values are untrusted (they may come from an imported preset file):
// sanitizeSelectionConfig is the single choke point that clamps every field.
export function sanitizeSelectionConfig(input: unknown): ReviewSelectionConfig {
  const raw = (input ?? {}) as Partial<ReviewSelectionConfig>;
  const d = DEFAULT_SELECTION_CONFIG;
  const num = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const modes: ReviewSelectionConfig["mode"][] = ["hybrid", "recent_scored", "steam_native"];
  const weights = (raw.weights ?? {}) as Partial<ReviewSelectionConfig["weights"]>;
  return {
    mode: modes.includes(raw.mode as ReviewSelectionConfig["mode"])
      ? (raw.mode as ReviewSelectionConfig["mode"])
      : d.mode,
    numReviews: num(raw.numReviews, d.numReviews, 5, 200),
    dayRange: num(raw.dayRange, d.dayRange, 1, 365),
    minChars: num(raw.minChars, d.minChars, 0, 500),
    minPlaytimeHours: num(raw.minPlaytimeHours, d.minPlaytimeHours, 0, 500),
    weights: {
      helpfulness: num(weights.helpfulness, d.weights.helpfulness, 0, 1),
      playtime: num(weights.playtime, d.weights.playtime, 0, 1),
      substance: num(weights.substance, d.weights.substance, 0, 1),
      freshness: num(weights.freshness, d.weights.freshness, 0, 1),
    },
  };
}

export async function loadSelectionConfig(): Promise<ReviewSelectionConfig> {
  const stored = await chrome.storage.local.get("selectionConfig");
  return sanitizeSelectionConfig(stored["selectionConfig"]);
}

export async function saveSelectionConfig(config: ReviewSelectionConfig): Promise<void> {
  await chrome.storage.local.set({ selectionConfig: config });
}

// F7 — provider profiles: users can define any number of them (same protocol,
// different endpoints) and pick the active one.
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

// F6 — summary cache duration (0 = disabled)
export const DEFAULT_CACHE_TTL_HOURS = 24;

export async function loadCacheTtlHours(): Promise<number> {
  const stored = await chrome.storage.local.get("cacheTtlHours");
  const value = stored["cacheTtlHours"];
  return typeof value === "number" && value >= 0 ? value : DEFAULT_CACHE_TTL_HOURS;
}

export async function saveCacheTtlHours(hours: number): Promise<void> {
  await chrome.storage.local.set({ cacheTtlHours: hours });
}

// F9 — selection configuration presets
export type PresetMap = Record<string, ReviewSelectionConfig>;

export async function loadPresets(): Promise<PresetMap> {
  const stored = await chrome.storage.local.get("selectionPresets");
  return (stored["selectionPresets"] as PresetMap | undefined) ?? {};
}

export async function savePresets(presets: PresetMap): Promise<void> {
  await chrome.storage.local.set({ selectionPresets: presets });
}

// F8 — output/UI language
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
