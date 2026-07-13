import type { ReviewSelectionConfig } from "./types";

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
