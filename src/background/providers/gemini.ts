import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import { parseTLDRSummary, TLDR_JSON_SCHEMA, type LLMProvider, type SummarizeRequest } from "./types";

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

// Google Gemini API: JSON garantito via responseMimeType + responseSchema.
export const geminiProvider: LLMProvider = {
  kind: "gemini",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    const baseUrl = (profile.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = `${baseUrl}/models/${profile.model}:generateContent`;

    // Lo schema Gemini non accetta anyOf/additionalProperties: variante con
    // recent_changes stringa semplice (vuota = nessuna nota).
    const schema = {
      type: "object",
      properties: {
        ...Object.fromEntries(
          Object.entries(TLDR_JSON_SCHEMA.properties).map(([key, value]) =>
            key === "recent_changes"
              ? [key, { type: "string", description: "Note su patch recenti, stringa vuota se assenti" }]
              : [key, value],
          ),
        ),
      },
      required: TLDR_JSON_SCHEMA.required,
    };

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
      throw new Error(`${profile.name}: risposta senza contenuto`);
    }
    const summary = parseTLDRSummary(text);
    // normalizza la variante di schema: stringa vuota -> null
    if (typeof summary.recent_changes === "string" && summary.recent_changes.trim() === "") {
      summary.recent_changes = null;
    }
    return summary;
  },
};
