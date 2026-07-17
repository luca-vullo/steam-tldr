import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "__MSG_extName__",
  description: "__MSG_extDescription__",
  version: pkg.version,
  default_locale: "en",
  homepage_url: "https://github.com/luca-vullo/steam-tldr",
  icons: {
    16: "icons/icon16.png",
    32: "icons/icon32.png",
    48: "icons/icon48.png",
    128: "icons/icon128.png",
  },
  permissions: ["storage"],
  host_permissions: [
    "https://store.steampowered.com/appreviews/*",
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*",
  ],
  // User-chosen endpoints (Azure AI Foundry, Azure OpenAI, local servers...):
  // permission is requested at runtime ONLY for the saved profile's origin,
  // never in bulk.
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
