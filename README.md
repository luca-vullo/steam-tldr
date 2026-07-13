# Steam TL;DR

A Chrome extension (Manifest V3) that generates an **AI summary of a game's recent Steam reviews**, right on its store page. A side widget shows "what players think right now" in a few lines: a one-line verdict, sentiment, recurring strengths and weaknesses, and notes about recent patches when reviews mention them.

Bring your own AI: the extension works with **your own API key** on the provider you prefer — Anthropic Claude, Claude deployed on Azure AI Foundry, OpenAI (official or Azure), Google Gemini, or a local OpenAI-compatible model (Ollama, LM Studio). No account, no backend, no telemetry.

> ⚠️ **Compliance first**: the extension **never posts anything to Steam**. The summary is rendered locally in your browser only. Publishing bot-generated reviews would violate Steam's rules ("Do not artificially influence reviews"). See [docs/SPECS.md](docs/SPECS.md#2-compliance-with-steam-guidelines).

## How it works

1. You visit a `store.steampowered.com/app/{appid}/...` page
2. A "TL;DR" tab appears on the right edge of the page; click it to open the side panel
3. Click **Generate TL;DR**: the service worker fetches recent reviews from Steam's public JSON endpoint (`/appreviews/{appid}?json=1`), selects the most relevant ones with a configurable scoring engine, and sends them to your configured AI provider
4. The structured summary appears in the panel; results are cached locally (24h by default) so revisiting a page is free

## Features

- **Side widget** styled to match the Steam store's dark theme — independent from Steam's page layout, so store redesigns can't break it
- **Multiple provider profiles**: define as many as you want (protocol + endpoint + key + model) and switch the active one; supported protocols:
  - **Anthropic** — Claude API, or Claude deployed on **Azure AI Foundry**
  - **OpenAI-compatible** — official OpenAI, **Azure AI Foundry** (OpenAI v1 endpoint), or **local servers** (Ollama, LM Studio — API key optional)
  - **Google Gemini**
- **Configurable review selection**: hybrid mode (most-helpful within a date range + most recent), pure recent with client-side scoring, or Steam's native ranking; tune review count, date range, minimum length and scoring weights, and save your configurations as **presets** (with JSON export/import)
- **5 languages** for the UI and the generated summary: English, Italian, Spanish, French, German — input reviews are read in *all* languages
- **Local cache** with configurable TTL; "Regenerate" bypasses it
- **Privacy by design**: your API keys live only in `chrome.storage.local` and are sent only to the endpoint of their own profile; review texts are the only data sent to the AI provider; no telemetry, no server of ours

## Install (from source)

```sh
git clone https://github.com/luca-vullo/steam-tldr.git
cd steam-tldr
npm install
npm run build
```

Then in Chrome:

1. Open `chrome://extensions` and enable **Developer mode**
2. Click **Load unpacked** and select the `dist/` folder
3. Open the extension's **Options** page, create a provider profile with your API key, and save
4. Visit any Steam game page and click the **TL;DR** tab on the right edge

## Configuration notes

| Profile type | Endpoint | Model field |
|---|---|---|
| Anthropic API | — (default) | Model ID, e.g. `claude-opus-4-8` |
| Claude — Azure AI Foundry | `https://YOUR-RESOURCE.services.ai.azure.com/anthropic/` | Your deployment name |
| OpenAI | — (default) | Model ID |
| OpenAI — Azure AI Foundry | Your resource's OpenAI v1 endpoint | Your deployment name |
| Google Gemini | — (default) | Model ID |
| Local (OpenAI-compatible) | e.g. `http://localhost:11434/v1` (Ollama) | Local model name (API key optional) |

For custom endpoints (Azure, local) the extension asks for host permission **only for that specific origin** when you save the profile.

## Documentation

- [docs/SPECS.md](docs/SPECS.md) — functional specification, Steam compliance, roadmap
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — technical architecture, data flows, provider layer

## Contributing

Issues and pull requests are welcome. Keep in mind the project's hard boundaries: no writes to Steam, no telemetry, no bundled API keys. Please run `npm run build` (typecheck included) before submitting.

## License

[MIT](LICENSE) © Luca Vullo

Not affiliated with Valve Corporation. Steam is a trademark of Valve Corporation. AI-generated summaries may contain mistakes — always check the actual reviews for important decisions.
