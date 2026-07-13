// Recensione normalizzata dall'endpoint appreviews.
// Nota: weighted_vote_score arriva come stringa con filter=all e come numero
// con filter=recent; 0.5 è il default neutro di Steam per recensioni senza voti.
export interface SteamReview {
  id: string; // recommendationid
  text: string;
  votedUp: boolean;
  votesUp: number;
  weightedVoteScore: number; // 0–1
  playtimeForeverMin: number;
  timestampCreated: number; // unix, secondi
  language: string;
}

export interface ReviewQuerySummary {
  reviewScoreDesc: string;
  totalPositive: number;
  totalNegative: number;
  totalReviews: number;
}

// F2 — configurazione del motore di selezione (salvabile come preset, F9)
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

// F3 — output strutturato del riassunto
export interface TLDRSummary {
  verdict: string; // una riga
  sentiment: "positive" | "mixed" | "negative";
  pros: string[]; // 3–5 punti ricorrenti
  cons: string[]; // 3–5 punti ricorrenti
  recent_changes: string | null; // note su patch/update se emergono
  reviews_analyzed: number;
  language: string;
}

// F7 — provider LLM
export type ProviderId = "anthropic" | "openai" | "gemini" | "azure";

export interface ProviderConfig {
  apiKey: string;
  model: string;
  // solo Azure AI Foundry:
  endpoint?: string;
  deployment?: string;
}

// Messaggi content script ⇄ service worker
export type Message =
  | { type: "ping"; appid: string }
  | { type: "fetchReviews"; appid: string }
  | { type: "summarize"; appid: string; gameName: string };

export type MessageResponse =
  | { type: "pong"; appid: string }
  | {
      type: "reviews";
      reviews: SteamReview[];
      querySummary: ReviewQuerySummary;
      poolSize: number; // recensioni nel pool prima della selezione
    }
  | {
      type: "summary";
      summary: TLDRSummary;
      reviewsUsed: number;
      poolSize: number;
      querySummary: ReviewQuerySummary;
    }
  | { type: "error"; code: "missing_api_key" | "generic"; message: string };
