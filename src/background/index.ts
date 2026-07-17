import type { AspectId, Message, MessageResponse } from "../shared/types";
import {
  activeProfile,
  loadCacheTtlHours,
  loadLanguage,
  loadProviderSettings,
  loadSelectionConfig,
  sanitizeAspects,
  sanitizeCustomAspect,
} from "../shared/settings";
import { collectReviews } from "./selection";
import { summarizeReviews } from "./summarizer";
import { cacheKey, getCached, putCached, selectionHash } from "./cache";

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
        return true; // async response

      case "summarize":
        handleSummarize(
          message.appid,
          message.gameName,
          message.force === true,
          sanitizeAspects(message.aspects),
          sanitizeCustomAspect(message.customAspect),
        )
          .then(sendResponse)
          .catch((err: unknown) =>
            sendResponse({ type: "error", code: "generic", message: String(err) }),
          );
        return true;

      case "openOptions":
        void chrome.runtime.openOptionsPage();
        return false;
    }
  },
);

async function handleFetchReviews(appid: string): Promise<MessageResponse> {
  const config = await loadSelectionConfig();
  const { selected, querySummary, poolSize } = await collectReviews(appid, config);
  return { type: "reviews", reviews: selected, querySummary, poolSize };
}

async function handleSummarize(
  appid: string,
  gameName: string,
  force: boolean,
  aspects: AspectId[],
  customAspect: string,
): Promise<MessageResponse> {
  const providerSettings = await loadProviderSettings();
  const profile = activeProfile(providerSettings);
  const selectionConfig = await loadSelectionConfig();
  const language = await loadLanguage();

  // F6 — cache first ("Regenerate" bypasses it with force); the requested
  // aspects are part of the key so toggling chips regenerates
  const aspectParts = [...aspects].sort() as string[];
  if (customAspect) aspectParts.push(`custom=${customAspect.toLowerCase()}`);
  const aspectsKey = aspectParts.length > 0 ? aspectParts.join("+") : "none";
  const key = cacheKey(
    appid,
    language,
    profile.id,
    profile.model,
    selectionHash(selectionConfig),
    aspectsKey,
  );
  const ttlHours = await loadCacheTtlHours();
  if (!force) {
    const cached = await getCached(key, ttlHours);
    if (cached) {
      return {
        type: "summary",
        summary: cached.summary,
        reviewsUsed: cached.reviewsUsed,
        poolSize: cached.poolSize,
        querySummary: cached.querySummary,
        fromCache: true,
        createdAt: cached.createdAt,
      };
    }
  }

  // The key may be empty only for local endpoints (openai_compat on localhost)
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(profile.baseUrl);
  if (!profile.apiKey && !isLocal) {
    return {
      type: "error",
      code: "missing_api_key",
      message: `Missing API key for profile "${profile.name}": set it in the options page`,
    };
  }

  const { selected, querySummary, poolSize } = await collectReviews(appid, selectionConfig);

  const summary = await summarizeReviews({
    profile,
    gameName,
    querySummary,
    reviews: selected,
    language,
    aspects,
    customAspect,
  });

  const createdAt = Date.now();
  await putCached(key, {
    summary,
    reviewsUsed: selected.length,
    poolSize,
    querySummary,
    createdAt,
  });

  return {
    type: "summary",
    summary,
    reviewsUsed: selected.length,
    poolSize,
    querySummary,
    fromCache: false,
    createdAt,
  };
}
