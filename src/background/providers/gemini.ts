import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import { parseTLDRSummary, TLDR_JSON_SCHEMA, type LLMProvider, type SummarizeRequest } from "./types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Google Gemini API: JSON guaranteed via responseMimeType + responseSchema.
export const geminiProvider: LLMProvider = {
  kind: "gemini",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    const baseUrl = (profile.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = `${baseUrl}/models/${profile.model}:generateContent`;

    // Gemini's schema dialect doesn't accept anyOf/additionalProperties:
    // variant with recent_changes as a plain string (empty = no notes) and
    // additionalProperties stripped recursively (it also appears nested in
    // the aspects items).
    const schema = stripAdditionalProperties({
      type: "object",
      properties: {
        ...Object.fromEntries(
          Object.entries(TLDR_JSON_SCHEMA.properties).map(([key, value]) =>
            key === "recent_changes"
              ? [key, { type: "string", description: "Notes about recent patches, empty string if none" }]
              : [key, value],
          ),
        ),
      },
      required: TLDR_JSON_SCHEMA.required,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": profile.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`${profile.name}: HTTP ${response.status} — ${(await response.text()).slice(0, 300)}`);
    }

    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("");
    if (!text) {
      throw new Error(`${profile.name}: response without content`);
    }
    const summary = parseTLDRSummary(text);
    // normalize the schema variant: empty string -> null
    if (typeof summary.recent_changes === "string" && summary.recent_changes.trim() === "") {
      summary.recent_changes = null;
    }
    return summary;
  },
};

function stripAdditionalProperties(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripAdditionalProperties);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "additionalProperties") continue;
      out[key] = stripAdditionalProperties(value);
    }
    return out;
  }
  return node;
}
