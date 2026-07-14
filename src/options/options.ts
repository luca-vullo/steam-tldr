// Options: provider profiles (F7), review selection with weights and presets
// (F2/F9), language (F8), cache (F6), automatic activation (F5).
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_SELECTION_CONFIG,
  sanitizeSelectionConfig,
  loadCacheTtlHours,
  loadLanguage,
  loadPresets,
  loadProviderSettings,
  loadSelectionConfig,
  saveCacheTtlHours,
  saveLanguage,
  savePresets,
  saveProviderSettings,
  saveSelectionConfig,
  type PresetMap,
  type ProviderSettings,
} from "../shared/settings";
import type {
  ProviderKind,
  ProviderProfile,
  ReviewSelectionConfig,
  SelectionMode,
} from "../shared/types";
import { initI18n, t, type LanguageCode } from "../shared/i18n";

// ---------- profile-type UI presets ----------
interface KindPreset {
  kind: ProviderKind;
  baseUrl: "fixed" | "required" | "editable";
  defaultBaseUrl: string;
  defaultModel: string;
  hintKey: string;
}

const KIND_PRESETS: Record<string, KindPreset> = {
  anthropic: { kind: "anthropic", baseUrl: "fixed", defaultBaseUrl: "", defaultModel: DEFAULT_ANTHROPIC_MODEL, hintKey: "" },
  anthropic_foundry: { kind: "anthropic", baseUrl: "required", defaultBaseUrl: "", defaultModel: "", hintKey: "optionsEndpointHintFoundry" },
  openai: { kind: "openai_compat", baseUrl: "fixed", defaultBaseUrl: "", defaultModel: "", hintKey: "" },
  openai_azure: { kind: "openai_compat", baseUrl: "required", defaultBaseUrl: "", defaultModel: "", hintKey: "optionsEndpointHintAzureOpenAI" },
  gemini: { kind: "gemini", baseUrl: "fixed", defaultBaseUrl: "", defaultModel: "", hintKey: "" },
  local: { kind: "openai_compat", baseUrl: "editable", defaultBaseUrl: "http://localhost:11434/v1", defaultModel: "", hintKey: "optionsEndpointHintLocal" },
};

const DEFAULT_PRESET_NAME = "Default";

// Applied after initI18n (F8: UI follows the selected language, not the browser's)
function applyTranslations(): void {
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    const key = el.dataset["i18n"];
    if (key) el.textContent = t(key);
  }
  // Tooltips explaining what each setting does
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-title]")) {
    const key = el.dataset["i18nTitle"];
    if (key) el.title = t(key);
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const profileList = $<HTMLUListElement>("profileList");
const nameInput = $<HTMLInputElement>("profileName");
const presetSelect = $<HTMLSelectElement>("preset");
const baseUrlRow = $<HTMLDivElement>("baseUrlRow");
const baseUrlInput = $<HTMLInputElement>("baseUrl");
const baseUrlHint = $<HTMLParagraphElement>("baseUrlHint");
const apiKeyInput = $<HTMLInputElement>("apiKey");
const modelInput = $<HTMLInputElement>("model");
const statusEl = $<HTMLSpanElement>("status");
const statusGeneralEl = $<HTMLSpanElement>("statusGeneral");
const presetListSelect = $<HTMLSelectElement>("presetList");
const presetNameInput = $<HTMLInputElement>("presetName");

let settings: ProviderSettings = { activeProfileId: "", profiles: [] };
let presets: PresetMap = {};
let editingId: string | null = null; // null = new profile
let currentLanguage: LanguageCode = "en";

// ---------- provider profiles ----------

function applyKindPreset(): void {
  const preset = KIND_PRESETS[presetSelect.value]!;
  baseUrlRow.classList.toggle("hidden", preset.baseUrl === "fixed");
  baseUrlInput.value = preset.defaultBaseUrl;
  baseUrlHint.textContent = preset.hintKey ? t(preset.hintKey) : "";
  if (!modelInput.value) modelInput.value = preset.defaultModel;
}

function renderProfiles(): void {
  profileList.replaceChildren();
  for (const profile of settings.profiles) {
    const li = document.createElement("li");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "activeProfile";
    radio.checked = profile.id === settings.activeProfileId;
    radio.title = t("optionsActive");
    radio.addEventListener("change", () => {
      settings.activeProfileId = profile.id;
      void persistProfiles();
    });

    const label = document.createElement("span");
    label.className = "grow";
    label.textContent = profile.name;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = profile.model + (profile.baseUrl ? ` · ${hostOf(profile.baseUrl)}` : "");

    const editBtn = document.createElement("button");
    editBtn.textContent = "✎";
    editBtn.title = t("optionsEdit");
    editBtn.addEventListener("click", () => startEdit(profile));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✕";
    deleteBtn.title = t("optionsDelete");
    deleteBtn.addEventListener("click", () => {
      settings.profiles = settings.profiles.filter((p) => p.id !== profile.id);
      if (settings.activeProfileId === profile.id) {
        settings.activeProfileId = settings.profiles[0]?.id ?? "";
      }
      void persistProfiles();
    });

    li.append(radio, label, meta, editBtn, deleteBtn);
    profileList.append(li);
  }
}

function startEdit(profile: ProviderProfile): void {
  editingId = profile.id;
  nameInput.value = profile.name;
  presetSelect.value = guessKindPreset(profile);
  applyKindPreset();
  baseUrlInput.value = profile.baseUrl;
  apiKeyInput.value = profile.apiKey;
  modelInput.value = profile.model;
}

function guessKindPreset(profile: ProviderProfile): string {
  if (profile.kind === "gemini") return "gemini";
  if (profile.kind === "anthropic") return profile.baseUrl ? "anthropic_foundry" : "anthropic";
  if (/localhost|127\.0\.0\.1/.test(profile.baseUrl)) return "local";
  return profile.baseUrl ? "openai_azure" : "openai";
}

function resetForm(): void {
  editingId = null;
  nameInput.value = "";
  apiKeyInput.value = "";
  modelInput.value = "";
  presetSelect.value = "anthropic";
  applyKindPreset();
  modelInput.value = DEFAULT_ANTHROPIC_MODEL;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

async function requestOriginPermission(baseUrl: string): Promise<boolean> {
  if (!baseUrl) return true;
  try {
    const origin = new URL(baseUrl).origin + "/*";
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}

async function saveProfile(): Promise<void> {
  const preset = KIND_PRESETS[presetSelect.value]!;
  const baseUrl = preset.baseUrl === "fixed" ? "" : baseUrlInput.value.trim();
  if (preset.baseUrl === "required" && !baseUrl) {
    flash(statusEl, t("optionsEndpointRequired"), "#cd5444");
    return;
  }

  // Custom endpoint: request the host permission ONLY for that origin
  if (baseUrl && !(await requestOriginPermission(baseUrl))) {
    flash(statusEl, t("optionsPermissionDenied"), "#cd5444");
    return;
  }

  const profile: ProviderProfile = {
    id: editingId ?? crypto.randomUUID(),
    name: nameInput.value.trim() || presetSelect.selectedOptions[0]!.textContent!.trim(),
    kind: preset.kind,
    baseUrl,
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim() || preset.defaultModel,
  };

  const index = settings.profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) settings.profiles[index] = profile;
  else settings.profiles.push(profile);
  if (!settings.activeProfileId) settings.activeProfileId = profile.id;

  await persistProfiles();
  resetForm();
  flash(statusEl, t("optionsSaved"), "#a4d007");
}

async function persistProfiles(): Promise<void> {
  await saveProviderSettings(settings);
  renderProfiles();
}

// ---------- review selection: form <-> config ----------

function readSelectionForm(): ReviewSelectionConfig {
  const num = (id: string, fallback: number) => {
    const value = Number($<HTMLInputElement>(id).value);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    mode: $<HTMLSelectElement>("mode").value as SelectionMode,
    numReviews: Math.max(5, Math.min(200, num("numReviews", 50))),
    dayRange: Math.max(1, Math.min(365, num("dayRange", 30))),
    minChars: Math.max(0, Math.min(500, num("minChars", 30))),
    weights: {
      helpfulness: clamp01(num("wHelpfulness", 0.4)),
      playtime: clamp01(num("wPlaytime", 0.3)),
      substance: clamp01(num("wSubstance", 0.2)),
      freshness: clamp01(num("wFreshness", 0.1)),
    },
  };
}

function writeSelectionForm(config: ReviewSelectionConfig): void {
  $<HTMLSelectElement>("mode").value = config.mode;
  $<HTMLInputElement>("numReviews").value = String(config.numReviews);
  $<HTMLInputElement>("dayRange").value = String(config.dayRange);
  $<HTMLInputElement>("minChars").value = String(config.minChars);
  $<HTMLInputElement>("wHelpfulness").value = String(config.weights.helpfulness);
  $<HTMLInputElement>("wPlaytime").value = String(config.weights.playtime);
  $<HTMLInputElement>("wSubstance").value = String(config.weights.substance);
  $<HTMLInputElement>("wFreshness").value = String(config.weights.freshness);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---------- presets (F9) ----------

function renderPresetList(): void {
  presetListSelect.replaceChildren();
  for (const name of [DEFAULT_PRESET_NAME, ...Object.keys(presets).sort()]) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    presetListSelect.append(option);
  }
}

async function presetLoad(): Promise<void> {
  const name = presetListSelect.value;
  const config = name === DEFAULT_PRESET_NAME ? DEFAULT_SELECTION_CONFIG : presets[name];
  if (!config) return;
  writeSelectionForm(config);
  await saveSelectionConfig(config);
  flash(statusGeneralEl, t("optionsSaved"), "#a4d007");
}

async function presetSave(): Promise<void> {
  const name = presetNameInput.value.trim() || presetListSelect.value;
  if (!name || name === DEFAULT_PRESET_NAME) {
    flash(statusGeneralEl, t("optionsPresetNameRequired"), "#cd5444");
    return;
  }
  presets[name] = readSelectionForm();
  await savePresets(presets);
  renderPresetList();
  presetListSelect.value = name;
  presetNameInput.value = "";
  flash(statusGeneralEl, t("optionsSaved"), "#a4d007");
}

async function presetDelete(): Promise<void> {
  const name = presetListSelect.value;
  if (name === DEFAULT_PRESET_NAME) return;
  delete presets[name];
  await savePresets(presets);
  renderPresetList();
}

function presetExport(): void {
  const payload = JSON.stringify({ selectionPresets: presets }, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "steam-tldr-presets.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

async function presetImport(file: File): Promise<void> {
  try {
    const parsed = JSON.parse(await file.text()) as { selectionPresets?: PresetMap };
    const incoming = parsed.selectionPresets;
    if (!incoming || typeof incoming !== "object") throw new Error("invalid format");
    for (const [name, config] of Object.entries(incoming)) {
      // Imported files are untrusted: sanitize every entry and cap the name
      if (name !== DEFAULT_PRESET_NAME) {
        presets[name.slice(0, 60)] = sanitizeSelectionConfig(config);
      }
    }
    await savePresets(presets);
    renderPresetList();
    flash(statusGeneralEl, t("optionsSaved"), "#a4d007");
  } catch {
    flash(statusGeneralEl, t("optionsPresetImportError"), "#cd5444");
  }
}

// ---------- general ----------

async function saveGeneral(): Promise<void> {
  await saveSelectionConfig(readSelectionForm());
  const newLanguage = $<HTMLSelectElement>("language").value as LanguageCode;
  await saveLanguage(newLanguage);
  const ttl = Number($<HTMLInputElement>("cacheTtl").value);
  await saveCacheTtlHours(Number.isFinite(ttl) && ttl >= 0 ? Math.min(720, ttl) : 24);
  await chrome.storage.local.set({ autoGenerate: $<HTMLInputElement>("autoGenerate").checked });
  if (newLanguage !== currentLanguage) {
    // Re-render the whole page in the new language
    location.reload();
    return;
  }
  flash(statusGeneralEl, t("optionsSaved"), "#a4d007");
}

function flash(el: HTMLElement, text: string, color: string): void {
  el.textContent = text;
  el.style.color = color;
  setTimeout(() => (el.textContent = ""), 2500);
}

async function init(): Promise<void> {
  // F8 — i18n first: everything rendered below uses t()
  currentLanguage = await loadLanguage();
  initI18n(currentLanguage);
  applyTranslations();

  settings = await loadProviderSettings();
  renderProfiles();
  resetForm();

  presets = await loadPresets();
  renderPresetList();

  writeSelectionForm(await loadSelectionConfig());
  $<HTMLSelectElement>("language").value = currentLanguage;
  $<HTMLInputElement>("cacheTtl").value = String(await loadCacheTtlHours());
  const stored = await chrome.storage.local.get("autoGenerate");
  $<HTMLInputElement>("autoGenerate").checked = stored["autoGenerate"] === true;
}

presetSelect.addEventListener("change", () => {
  modelInput.value = "";
  applyKindPreset();
});
$<HTMLButtonElement>("saveProfile").addEventListener("click", () => void saveProfile());
$<HTMLButtonElement>("resetForm").addEventListener("click", resetForm);
$<HTMLButtonElement>("saveGeneral").addEventListener("click", () => void saveGeneral());
$<HTMLButtonElement>("presetLoad").addEventListener("click", () => void presetLoad());
$<HTMLButtonElement>("presetSave").addEventListener("click", () => void presetSave());
$<HTMLButtonElement>("presetDelete").addEventListener("click", () => void presetDelete());
$<HTMLButtonElement>("presetExport").addEventListener("click", presetExport);
$<HTMLButtonElement>("presetImportBtn").addEventListener("click", () =>
  $<HTMLInputElement>("presetImport").click(),
);
$<HTMLInputElement>("presetImport").addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void presetImport(file);
});
void init();
