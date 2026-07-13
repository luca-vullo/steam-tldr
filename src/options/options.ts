// Pagina opzioni minima per M2: provider Anthropic, lingua e selezione base.
// La versione completa (tutti i provider, pesi, preset F9) arriva con M3/M4.
import {
  DEFAULT_MODELS,
  loadLanguage,
  loadProviderSettings,
  loadSelectionConfig,
  saveLanguage,
  saveProviderSettings,
  saveSelectionConfig,
} from "../shared/settings";
import type { SelectionMode } from "../shared/types";
import type { LanguageCode } from "../shared/i18n";

for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
  const key = el.dataset["i18n"];
  if (key) el.textContent = chrome.i18n.getMessage(key);
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const apiKeyInput = $<HTMLInputElement>("apiKey");
const modelInput = $<HTMLInputElement>("model");
const languageSelect = $<HTMLSelectElement>("language");
const modeSelect = $<HTMLSelectElement>("mode");
const numReviewsInput = $<HTMLInputElement>("numReviews");
const statusEl = $<HTMLSpanElement>("status");

async function restore(): Promise<void> {
  const providerSettings = await loadProviderSettings();
  const anthropic = providerSettings.configs.anthropic;
  apiKeyInput.value = anthropic?.apiKey ?? "";
  modelInput.value = anthropic?.model ?? DEFAULT_MODELS.anthropic;

  languageSelect.value = await loadLanguage();

  const selection = await loadSelectionConfig();
  modeSelect.value = selection.mode;
  numReviewsInput.value = String(selection.numReviews);
}

async function save(): Promise<void> {
  const providerSettings = await loadProviderSettings();
  providerSettings.active = "anthropic";
  providerSettings.configs.anthropic = {
    apiKey: apiKeyInput.value.trim(),
    model: modelInput.value.trim() || DEFAULT_MODELS.anthropic,
  };
  await saveProviderSettings(providerSettings);

  await saveLanguage(languageSelect.value as LanguageCode);

  const selection = await loadSelectionConfig();
  selection.mode = modeSelect.value as SelectionMode;
  selection.numReviews = Math.max(5, Math.min(200, Number(numReviewsInput.value) || 50));
  await saveSelectionConfig(selection);

  statusEl.textContent = chrome.i18n.getMessage("optionsSaved");
  setTimeout(() => (statusEl.textContent = ""), 2000);
}

$<HTMLButtonElement>("save").addEventListener("click", () => void save());
void restore();
