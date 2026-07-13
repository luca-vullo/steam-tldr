import type { ProviderConfig, ProviderId, TLDRSummary } from "../../shared/types";

// Richiesta provider-agnostica costruita dal summarizer: ogni adapter la
// traduce nella chiamata nativa del proprio provider e garantisce un JSON
// conforme allo schema TLDRSummary.
export interface SummarizeRequest {
  system: string;
  user: string;
}

export interface LLMProvider {
  id: ProviderId;
  summarize(request: SummarizeRequest, config: ProviderConfig): Promise<TLDRSummary>;
}

// JSON schema condiviso tra gli adapter (structured outputs / json_schema / responseSchema)
export const TLDR_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      description: "Verdetto in una riga, nella lingua richiesta",
    },
    sentiment: { type: "string", enum: ["positive", "mixed", "negative"] },
    pros: {
      type: "array",
      items: { type: "string" },
      description: "3-5 punti di forza ricorrenti",
    },
    cons: {
      type: "array",
      items: { type: "string" },
      description: "3-5 lamentele ricorrenti",
    },
    recent_changes: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Note su patch/aggiornamenti recenti se emergono, altrimenti null",
    },
    reviews_analyzed: { type: "integer" },
    language: { type: "string" },
  },
  required: [
    "verdict",
    "sentiment",
    "pros",
    "cons",
    "recent_changes",
    "reviews_analyzed",
    "language",
  ],
  additionalProperties: false,
} as const;

export function parseTLDRSummary(jsonText: string): TLDRSummary {
  const parsed = JSON.parse(jsonText) as TLDRSummary;
  if (
    typeof parsed.verdict !== "string" ||
    !["positive", "mixed", "negative"].includes(parsed.sentiment) ||
    !Array.isArray(parsed.pros) ||
    !Array.isArray(parsed.cons)
  ) {
    throw new Error("Output del modello non conforme allo schema TLDRSummary");
  }
  return parsed;
}
