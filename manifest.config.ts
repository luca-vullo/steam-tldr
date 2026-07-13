import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extName__",
  description: "__MSG_extDescription__",
  version: pkg.version,
  default_locale: "en",
  permissions: ["storage"],
  host_permissions: [
    "https://store.steampowered.com/appreviews/*",
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
  ],
  // Endpoint scelti dall'utente (Azure AI Foundry, Azure OpenAI, server
  // locali...): il permesso viene richiesto a runtime SOLO per l'origin del
  // profilo salvato, mai in blocco.
  optional_host_permissions: [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*",
  ],
  content_scripts: [
    {
      matches: ["https://store.steampowered.com/app/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  options_page: "src/options/options.html",
});
