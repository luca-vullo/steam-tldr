import Anthropic from "@anthropic-ai/sdk";
import type { ProviderConfig, TLDRSummary } from "../../shared/types";
import { parseTLDRSummary, TLDR_JSON_SCHEMA, type LLMProvider, type SummarizeRequest } from "./types";

export const anthropicProvider: LLMProvider = {
  id: "anthropic",

  async summarize(request: SummarizeRequest, config: ProviderConfig): Promise<TLDRSummary> {
    // La chiave è dell'utente, inserita nelle opzioni: non c'è nulla da
    // nascondere dietro un backend, quindi la chiamata parte dal service worker.
    const client = new Anthropic({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true,
    });

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4000,
      thinking: { type: "adaptive" },
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
