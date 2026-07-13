// Opzioni: profili provider (F7), lingua (F8) e selezione recensioni (F2).
// Pesi dello scoring e preset completi (F9) arrivano con M3/M4.
import {
  DEFAULT_ANTHROPIC_MODEL,
  loadLanguage,
  loadProviderSettings,
  loadSelectionConfig,
  saveLanguage,
  saveProviderSettings,
  saveSelectionConfig,
  type ProviderSettings,
} from "../shared/settings";
import type { ProviderKind, ProviderProfile, SelectionMode } from "../shared/types";
import type { LanguageCode } from "../shared/i18n";

// Preset UI → protocollo + endpoint. baseUrl "fixed" = endpoint di default del
// protocollo, campo nascosto; "required" = endpoint della risorsa utente.
interface Preset {
  kind: ProviderKind;
  baseUrl: "fixed" | "required" | "editable";
  defaultBaseUrl: string;
  defaultModel: string;
  hintKey: string;
}

const PRESETS: Record<string, Preset> = {
  anthropic: {
    kind: "anthropic",
    baseUrl: "fixed",
    defaultBaseUrl: "",
    defaultModel: DEFAULT_ANTHROPIC_MODEL,
    hintKey: "",
  },
  anthropic_foundry: {
    kind: "anthropic",
    baseUrl: "required",
    defaultBaseUrl: "",
    defaultModel: "",
    hintKey: "optionsEndpointHintFoundry",
  },
  openai: {
    kind: "openai_compat",
    baseUrl: "fixed",
    defaultBaseUrl: "",
    defaultModel: "",
    hintKey: "",
  },
  openai_azure: {
    kind: "openai_compat",
    baseUrl: "required",
    defaultBaseUrl: "",
    defaultModel: "",
    hintKey: "optionsEndpointHintAzureOpenAI",
  },
  gemini: {
    kind: "gemini",
    baseUrl: "fixed",
    defaultBaseUrl: "",
    defaultModel: "",
    hintKey: "",
  },
  local: {
    kind: "openai_compat",
    baseUrl: "editable",
    defaultBaseUrl: "http://localhost:11434/v1",
    defaultModel: "",
    hintKey: "optionsEndpointHintLocal",
  },
};

for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
  const key = el.dataset["i18n"];
  if (key) el.textContent = chrome.i18n.getMessage(key);
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

let settings: ProviderSettings = { activeProfileId: "", profiles: [] };
let editingId: string | null = null; // null = nuovo profilo

function applyPreset(): void {
  const preset = PRESETS[presetSelect.value]!;
  baseUrlRow.classList.toggle("hidden", preset.baseUrl === "fixed");
  baseUrlInput.value = preset.defaultBaseUrl;
  baseUrlInput.required = preset.baseUrl === "required";
  baseUrlHint.textContent = preset.hintKey ? chrome.i18n.getMessage(preset.hintKey) : "";
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
    radio.title = chrome.i18n.getMessage("optionsActive");
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
    editBtn.title = chrome.i18n.getMessage("optionsEdit");
    editBtn.addEventListener("click", () => startEdit(profile));

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "✕";
    deleteBtn.title = chrome.i18n.getMessage("optionsDelete");
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
  presetSelect.value = guessPreset(profile);
  applyPreset();
  baseUrlInput.value = profile.baseUrl;
  apiKeyInput.value = profile.apiKey;
  modelInput.value = profile.model;
}

function guessPreset(profile: ProviderProfile): string {
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
  applyPreset();
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
  const preset = PRESETS[presetSelect.value]!;
  const baseUrl = preset.baseUrl === "fixed" ? "" : baseUrlInput.value.trim();
  if (preset.baseUrl === "required" && !baseUrl) {
    flash(statusEl, chrome.i18n.getMessage("optionsEndpointRequired"), "crimson");
    return;
  }

  // Endpoint custom: chiedi il permesso host SOLO per quell'origin
  if (baseUrl && !(await requestOriginPermission(baseUrl))) {
    flash(statusEl, chrome.i18n.getMessage("optionsPermissionDenied"), "crimson");
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
  flash(statusEl, chrome.i18n.getMessage("optionsSaved"), "green");
}

async function persistProfiles(): Promise<void> {
  await saveProviderSettings(settings);
  renderProfiles();
}

async function saveGeneral(): Promise<void> {
  await saveLanguage($<HTMLSelectElement>("language").value as LanguageCode);
  const selection = await loadSelectionConfig();
  selection.mode = $<HTMLSelectElement>("mode").value as SelectionMode;
  selection.numReviews = Math.max(
    5,
    Math.min(200, Number($<HTMLInputElement>("numReviews").value) || 50),
  );
  await saveSelectionConfig(selection);
  flash(statusGeneralEl, chrome.i18n.getMessage("optionsSaved"), "green");
}

function flash(el: HTMLElement, text: string, color: string): void {
  el.textContent = text;
  el.style.color = color;
  setTimeout(() => (el.textContent = ""), 2500);
}

async function init(): Promise<void> {
  settings = await loadProviderSettings();
  renderProfiles();
  resetForm();

  $<HTMLSelectElement>("language").value = await loadLanguage();
  const selection = await loadSelectionConfig();
  $<HTMLSelectElement>("mode").value = selection.mode;
  $<HTMLInputElement>("numReviews").value = String(selection.numReviews);
}

presetSelect.addEventListener("change", () => {
  modelInput.value = "";
  applyPreset();
});
$<HTMLButtonElement>("saveProfile").addEventListener("click", () => void saveProfile());
$<HTMLButtonElement>("resetForm").addEventListener("click", resetForm);
$<HTMLButtonElement>("saveGeneral").addEventListener("click", () => void saveGeneral());
void init();
