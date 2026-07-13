import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import {
  jsonInstruction,
  parseTLDRSummary,
  TLDR_JSON_SCHEMA,
  type LLMProvider,
  type SummarizeRequest,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

// OpenAI-compatible Chat Completions protocol: covers OpenAI, Azure AI
// Foundry (OpenAI v1 endpoint) and local servers like Ollama or LM Studio.
// Plain fetch, no SDK: one adapter serves every compatible endpoint without
// the official client's auth constraints.
export const openAICompatProvider: LLMProvider = {
  kind: "openai_compat",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    // Tolerate a full URL pasted by the user: we append the path ourselves
    const baseUrl = (profile.baseUrl || DEFAULT_BASE_URL)
      .replace(/\/chat\/completions\/?$/, "")
      .replace(/\/$/, "");
    const url = `${baseUrl}/chat/completions`;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (profile.apiKey) {
      // Bearer for OpenAI/local; api-key for Azure. Sending both is harmless
      // and saves one more configuration knob.
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

    // Some compatible endpoints don't support response_format json_schema:
    // retry once with the constraint moved into the prompt.
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
      throw new Error(`${profile.name}: response without content`);
    }
    return parseTLDRSummary(content);
  },
};

async function safeText(response: Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "(unreadable body)";
  }
}
