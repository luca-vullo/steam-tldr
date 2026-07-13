import Anthropic from "@anthropic-ai/sdk";
import AnthropicFoundry from "@anthropic-ai/foundry-sdk";
import type { ProviderProfile, TLDRSummary } from "../../shared/types";
import { parseTLDRSummary, TLDR_JSON_SCHEMA, type LLMProvider, type SummarizeRequest } from "./types";

// Protocollo Anthropic Messages: copre api.anthropic.com e Claude deployato
// su Azure AI Foundry (baseUrl dell'endpoint, model = nome del deployment).
export const anthropicProvider: LLMProvider = {
  kind: "anthropic",

  async summarize(request: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary> {
    // La chiave è dell'utente, inserita nelle opzioni: non c'è nulla da
    // nascondere dietro un backend, quindi la chiamata parte dal service worker.
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

    // Niente parametro thinking: deve funzionare con qualsiasi modello Claude
    // (Haiku 4.5 non supporta l'adattivo) e per un riassunto non serve.
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
      throw new Error("Il modello ha rifiutato la richiesta (stop_reason: refusal)");
    }
    if (response.stop_reason === "max_tokens") {
      throw new Error("Output troncato (stop_reason: max_tokens)");
    }

    const text = response.content.find((block) => block.type === "text");
    if (!text) {
      throw new Error("Risposta senza blocco di testo");
    }
    return parseTLDRSummary(text.text);
  },
};

// L'SDK aggiunge da solo "v1/messages" alla baseURL: se l'utente incolla
// l'URL completo dell'endpoint, il suffisso va rimosso (altrimenti 404).
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/(v1\/)?(messages)?\/?$/, "") + "/";
}
