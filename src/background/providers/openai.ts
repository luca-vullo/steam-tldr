import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import {
  jsonInstruction,
  parseTLDRSummary,
  TLDR_JSON_SCHEMA,
  type LLMProvider,
  type SummarizeRequest,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// Protocollo Chat Completions OpenAI-compatibile: copre OpenAI, Azure AI
// Foundry (endpoint OpenAI v1) e server locali come Ollama o LM Studio.
// Chiamata via fetch: nessun SDK, così lo stesso adapter serve tutti gli
// endpoint compatibili senza vincoli di auth del client ufficiale.
export const openAICompatProvider: LLMProvider = {
  kind: "openai_compat",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    const baseUrl = (profile.baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (profile.apiKey) {
      // Bearer per OpenAI/locali; api-key per Azure. Inviarli entrambi è
      // innocuo e evita una configurazione in più.
      headers["Authorization"] = `Bearer ${profile.apiKey}`;
      headers["api-key"] = profile.apiKey;
    }

    const body = {
      model: profile.model,
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "tldr_summary", strict: true, schema: TLDR_JSON_SCHEMA },
      },
    };

    let response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    // Alcuni endpoint compatibili non supportano response_format json_schema:
    // riprova una volta spostando il vincolo nel prompt.
    if (response.status === 400) {
      const fallbackBody = {
        model: profile.model,
        messages: [
          { role: "system", content: request.system + jsonInstruction() },
          { role: "user", content: request.user },
        ],
      };
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(fallbackBody),
      });
    }

    if (!response.ok) {
      throw new Error(`${profile.name}: HTTP ${response.status} — ${await safeText(response)}`);
    }

    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`${profile.name}: risposta senza contenuto`);
    }
    return parseTLDRSummary(content);
  },
};

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "(corpo non leggibile)";
  }
}
