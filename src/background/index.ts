import type { Message, MessageResponse } from "../shared/types";
import {
  activeProviderConfig,
  loadLanguage,
  loadProviderSettings,
  loadSelectionConfig,
} from "../shared/settings";
import { collectReviews } from "./selection";
import { summarizeReviews } from "./summarizer";

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (r: MessageResponse) => void) => {
    switch (message.type) {
      case "ping":
        sendResponse({ type: "pong", appid: message.appid });
        return false;

      case "fetchReviews":
        handleFetchReviews(message.appid)
          .then(sendResponse)
          .catch((err: unknown) =>
            sendResponse({ type: "error", code: "generic", message: String(err) }),
          );
        return true; // risposta asincrona

      case "summarize":
        handleSummarize(message.appid, message.gameName)
          .then(sendResponse)
          .catch((err: unknown) =>
            sendResponse({ type: "error", code: "generic", message: String(err) }),
          );
        return true;
    }
  },
);

async function handleFetchReviews(appid: string): Promise<MessageResponse> {
  const config = await loadSelectionConfig();
  const { selected, querySummary, poolSize } = await collectReviews(appid, config);
  return { type: "reviews", reviews: selected, querySummary, poolSize };
}

async function handleSummarize(appid: string, gameName: string): Promise<MessageResponse> {
  const providerSettings = await loadProviderSettings();
  const providerConfig = activeProviderConfig(providerSettings);
  if (!providerConfig.apiKey) {
    return {
      type: "error",
      code: "missing_api_key",
      message: `Chiave API mancante per il provider "${providerSettings.active}": inseriscila nella pagina opzioni`,
    };
  }

  const selectionConfig = await loadSelectionConfig();
  const language = await loadLanguage();
  const { selected, querySummary, poolSize } = await collectReviews(appid, selectionConfig);

  const summary = await summarizeReviews({
    provider: providerSettings.active,
    config: providerConfig,
    gameName,
    querySummary,
    reviews: selected,
    language,
  });

  return {
    type: "summary",
    summary,
    reviewsUsed: selected.length,
    poolSize,
    querySummary,
  };
}
