import type { ProviderKind, ProviderProfile, TLDRSummary } from "../../shared/types";

// Provider-agnostic request built by the summarizer: each adapter translates
// it into its protocol's native call and guarantees JSON conforming to the
// TLDRSummary schema.
export interface SummarizeRequest {
  system: string;
  user: string;
}

export interface LLMProvider {
  kind: ProviderKind;
  summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary>;
}

// JSON schema shared across adapters (structured outputs / json_schema / responseSchema)
export const TLDR_JSON_SCHEMA = {
  type: "object",
  properties: {
    verdict: {
      type: "string",
      description: "One-line verdict, in the requested language",
    },
    sentiment: { type: "string", enum: ["positive", "mixed", "negative"] },
    recent_trend: {
      type: "string",
      enum: ["better", "similar", "worse"],
      description:
        "Recent reviews compared with the overall historical rating provided in the input",
    },
    pros: {
      type: "array",
      items: { type: "string" },
      description: "3-5 recurring strengths",
    },
    cons: {
      type: "array",
      items: { type: "string" },
      description: "3-5 recurring complaints",
    },
    aspects: {
      type: "array",
      description: "One entry per requested focus aspect; empty if none requested",
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            enum: ["performance", "story", "controls_ui", "pacing", "multiplayer", "custom"],
          },
          sentiment: {
            type: "string",
            enum: ["positive", "mixed", "negative", "not_mentioned"],
          },
          note: {
            type: "string",
            description: "1-2 sentences on what reviews say about this aspect",
          },
        },
        required: ["id", "sentiment", "note"],
        additionalProperties: false,
      },
    },
    recent_changes: {
      anyOf: [{ type: "string" }, { type: "null" }],
      description: "Notes about recent patches/updates if any emerge, otherwise null",
    },
    reviews_analyzed: { type: "integer" },
    language: { type: "string" },
  },
  required: [
    "verdict",
    "sentiment",
    "recent_trend",
    "pros",
    "cons",
    "aspects",
    "recent_changes",
    "reviews_analyzed",
    "language",
  ],
  additionalProperties: false,
} as const;

export function parseTLDRSummary(jsonText: string): TLDRSummary {
  // Some models (especially local ones without structured output) wrap the
  // JSON in prose or code fences: extract the first plausible object.
  const start = jsonText.indexOf("{");
  const end = jsonText.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("No JSON in the model output");
  }
  const parsed = JSON.parse(jsonText.slice(start, end + 1)) as TLDRSummary;
  if (
    typeof parsed.verdict !== "string" ||
    !["positive", "mixed", "negative"].includes(parsed.sentiment) ||
    !Array.isArray(parsed.pros) ||
    !Array.isArray(parsed.cons)
  ) {
    throw new Error("Model output does not match the TLDRSummary schema");
  }
  // recent_trend is best-effort: an invalid/missing value (e.g. from local
  // models on the prompt-constraint fallback) hides the trend line instead
  // of failing the whole summary
  if (!["better", "similar", "worse"].includes(parsed.recent_trend as string)) {
    parsed.recent_trend = null;
  }
  // aspects are best-effort too: drop malformed entries instead of failing
  const validAspectIds = ["performance", "story", "controls_ui", "pacing", "multiplayer", "custom"];
  const validAspectSentiments = ["positive", "mixed", "negative", "not_mentioned"];
  parsed.aspects = Array.isArray(parsed.aspects)
    ? parsed.aspects.filter(
        (a) =>
          a &&
          validAspectIds.includes(a.id) &&
          validAspectSentiments.includes(a.sentiment) &&
          typeof a.note === "string",
      )
    : [];
  return parsed;
}

// Fallback instruction when the protocol/endpoint doesn't support a native
// schema (e.g. some local servers): the constraint moves into the prompt.
export function jsonInstruction(): string {
  return (
    "\n\nRespond ONLY with a JSON object conforming to this schema, with no extra text and no code fences:\n" +
    JSON.stringify(TLDR_JSON_SCHEMA)
  );
}
