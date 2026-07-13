// Review normalized from the appreviews endpoint.
// Note: weighted_vote_score comes back as a string with filter=all and as a
// number with filter=recent; 0.5 is Steam's neutral default for unvoted reviews.
export interface SteamReview {
  id: string; // recommendationid
  text: string;
  votedUp: boolean;
  votesUp: number;
  weightedVoteScore: number; // 0–1
  playtimeForeverMin: number;
  timestampCreated: number; // unix, seconds
  language: string;
}

export interface ReviewQuerySummary {
  reviewScoreDesc: string;
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
}

// F2 — review selection engine configuration (savable as a preset, F9)
export type SelectionMode = "hybrid" | "recent_scored" | "steam_native";

export interface SelectionWeights {
  helpfulness: number;
  playtime: number;
  substance: number;
  freshness: number;
}

export interface ReviewSelectionConfig {
  mode: SelectionMode;
  numReviews: number;
  dayRange: number;
  weights: SelectionWeights;
  minChars: number;
}

// F3 — structured summary output
export interface TLDRSummary {
  verdict: string; // one line
  sentiment: "positive" | "mixed" | "negative";
  pros: string[]; // 3–5 recurring points
  cons: string[]; // 3–5 recurring points
  recent_changes: string | null; // notes about patches/updates if any emerge
  reviews_analyzed: number;
  language: string;
}

// F7 — provider profiles. A profile = API protocol + endpoint + key + model.
// One protocol covers multiple deployments: "anthropic" works for both
// api.anthropic.com and Claude on Azure AI Foundry (custom baseUrl);
// "openai_compat" covers OpenAI, Azure AI Foundry (OpenAI v1 endpoint) and
// local OpenAI-compatible servers (Ollama, LM Studio, ...).
export type ProviderKind = "anthropic" | "openai_compat" | "gemini";

export interface ProviderProfile {
  id: string; // generated
  name: string; // user-chosen label
  kind: ProviderKind;
  baseUrl: string; // "" = the protocol's default endpoint
  apiKey: string; // may be empty for local servers
  model: string; // model ID, or deployment name on Azure Foundry
}

// Content script ⇄ service worker messages
export type Message =
  | { type: "ping"; appid: string }
  | { type: "fetchReviews"; appid: string }
  | { type: "summarize"; appid: string; gameName: string; force?: boolean }
  // chrome-extension:// pages can't be navigated to from a web page
  // (ERR_BLOCKED_BY_CLIENT), so the widget asks the service worker to open
  // the options via chrome.runtime.openOptionsPage()
  | { type: "openOptions" };

export type MessageResponse =
  | { type: "pong"; appid: string }
  | {
      type: "reviews";
      reviews: SteamReview[];
      querySummary: ReviewQuerySummary;
      poolSize: number; // pool size before selection
    }
  | {
      type: "summary";
      summary: TLDRSummary;
      reviewsUsed: number;
      poolSize: number;
      querySummary: ReviewQuerySummary;
      fromCache: boolean;
      createdAt: number; // generation time, epoch ms
    }
  | { type: "error"; code: "missing_api_key" | "generic"; message: string };
