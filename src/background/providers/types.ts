import type { ProviderKind, ProviderProfile, TLDRSummary } from "../../shared/types";

// Richiesta provider-agnostica costruita dal summarizer: ogni adapter la
// traduce nella chiamata nativa del proprio protocollo e garantisce un JSON
// conforme allo schema TLDRSummary.
export interface SummarizeRequest {
  system: string;
  user: string;
}

export interface LLMProvider {
  kind: ProviderKind;
  summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary>;
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
  // Alcuni modelli (soprattutto locali, senza output strutturato) avvolgono
  // il JSON in testo o code fence: estraiamo il primo oggetto plausibile.
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Nessun JSON nell'output del modello");
  }
  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as TLDRSummary;
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

// Istruzione di fallback quando il protocollo/endpoint non supporta lo schema
// nativo (es. alcuni server locali): il vincolo passa nel prompt.
export function jsonInstruction(): string {
  return (
    "\n\nRispondi ESCLUSIVAMENTE con un oggetto JSON conforme a questo schema, senza testo aggiuntivo né code fence:\n" +
    JSON.stringify(TLDR_JSON_SCHEMA)
  );
}
