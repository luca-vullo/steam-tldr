import Anthropic from "@anthropic-ai/sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";
import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import { parseTLDRSummary, TLDR_JSON_SCHEMA, type LLMProvider, type SummarizeRequest } from "./types";

// Anthropic Messages protocol: covers api.anthropic.com and Claude deployed
// on Azure AI Foundry (baseUrl = resource endpoint, model = deployment name).
export const anthropicProvider: LLMProvider = {
  kind: "anthropic",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    // The key belongs to the user, entered in the options: there is nothing
    // to hide behind a backend, so the call goes out from the service worker.
    const client = profile.baseUrl
      ? new AnthropicFoundry({
          apiKey: profile.apiKey,
          baseURL: normalizeBaseUrl(profile.baseUrl),
          dangerouslyAllowBrowser: true,
        })
      : new Anthropic({
          apiKey: profile.apiKey,
          dangerouslyAllowBrowser: true,
        });

    // No thinking parameter: the adapter must work with every Claude model
    // (Haiku 4.5 doesn't support adaptive) and summarization doesn't need it.
    const response = await client.messages.create({
      model: profile.model,
      max_tokens: 4000,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: {
        format: { type: "json_schema", schema: TLDR_JSON_SCHEMA },
      },
    });

    if (response.stop_reason === "refusal") {
      throw new Error("The model refused the request (stop_reason: refusal)");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Output truncated (stop_reason: max_tokens)");
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) {
      throw new Error("Response without a text block");
    }
    return parseTLDRSummary(text.text);
  },
};

// The SDK appends "v1/messages" to the baseURL on its own: if the user pastes
// the full endpoint URL, the suffix must be stripped (otherwise 404).
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/(v1\/)?(messages)?\/?$/, "") + "/";
}
