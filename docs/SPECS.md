# Functional specification — Steam TL;DR

## 1. Vision

Help people who are evaluating a game purchase on Steam quickly understand **what players think right now**, by summarizing the most recent reviews into a TL;DR readable in 20 seconds: overall sentiment, recurring strengths, recurring complaints, and notes about recent patches/updates when they emerge from the reviews.

## 2. Compliance with Steam guidelines

This is the most important design decision of the project.

### What we do NOT do (and why)

| Discarded idea | Steam guideline it would violate |
|---|---|
| Posting the summary as a Steam review via bot | "Do not artificially influence reviews" — automated/multiple reviews are explicitly forbidden |
| Posting the summary in Community discussions | Off-topic content / spam; reviews must reflect personal play experience |
| Including links or promotions in generated content | "Commercial content is not allowed" |

### What we do

- **Local display only**: the summary lives in an overlay widget visible only to the user who installed the extension. Nothing is ever sent to Steam.
- **Read-only access to public endpoints**: reviews are read from Steam's public, documented JSON endpoint (`https://store.steampowered.com/appreviews/{appid}?json=1`), the same one the store page uses. No aggressive scraping, no login, no automation of the user's account.
- **Polite rate limiting**: at most two fetches per visited page (one in non-hybrid selection modes, see F2), with a local cache (24h default) to avoid hammering Steam's servers.
- **Transparency**: the widget clearly states that the text is an AI-generated summary based on user reviews, with the count of reviews analyzed and the generation date.

## 3. Features

### MVP (v0.1)

- **F1 — Game page detection**: the content script activates on `store.steampowered.com/app/{appid}/*` and extracts the `appid` from the URL.
- **F2 — Review fetch and selection**: reviews are fetched in all languages (`language=all`) and the most recent/relevant ones are selected to send to the model. The strategy is **configurable** (to allow experimentation), with the hybrid mode as default:
  - **mode**: `hybrid` (default — union of "most helpful within the date range" and "most recent"), `recent_scored` (recent only + client-side scoring), `steam_native` (Steam's own helpfulness ranking);
  - **number of reviews** sent to the model (default 50);
  - **date range** for the "helpful" component (default 30 days);
  - **client-side scoring weights**: helpfulness, hours played, text length, freshness (defaults 0.4 / 0.3 / 0.2 / 0.1).

  Selection engine details in [ARCHITECTURE.md](ARCHITECTURE.md#3-data-source-steams-reviews-endpoint).
- **F3 — AI summary**: one call to the configured LLM provider produces a structured TL;DR: one-line verdict, sentiment (positive/mixed/negative), 3–5 pros, 3–5 cons, optional note about recent patches.
- **F4 — UI widget**: a fixed "TL;DR" tab on the right edge of the page opens a side drawer, styled to match the store's dark theme. **Independent from Steam's layout** (no page markup selectors: in-DOM injection proved fragile, the overlay widget is not). States: idle with a "Generate" button, loading, result, error (missing key, network, etc.).
- **F5 — Options**: options page for: AI provider profiles and their API keys (see F7, stored in `chrome.storage.local`), model, language (see F8), review selection settings with presets (see F2 and F9), cache duration, automatic vs. manual activation (default: manual click).
- **F6 — Cache**: summaries stored per `appid` + language + provider profile/model + selection configuration, with configurable TTL (default 24h), to avoid cost and latency on repeat visits. "Regenerate" bypasses the cache.
- **F7 — Multi-provider profiles**: the user defines one or more **provider profiles** (name, type, endpoint, API key, model/deployment) and picks the active one; keys of the other profiles stay saved. A profile is protocol + endpoint, so one protocol covers multiple deployments:
  - **Anthropic protocol** — Claude API (default), or Claude deployed on **Azure AI Foundry** (resource endpoint + deployment name)
  - **OpenAI-compatible protocol** — official OpenAI, models on **Azure AI Foundry** (OpenAI v1 endpoint), or **local models** (Ollama, LM Studio and any OpenAI-compatible server; API key optional)
  - **Google Gemini** — Gemini API

  For custom endpoints (Azure, local) the host permission is requested at runtime for the profile's origin only. The implementation is an adapter-per-protocol abstraction: the rest of the extension talks to a single interface (see [ARCHITECTURE.md](ARCHITECTURE.md#4-summarization-llm-provider-layer)).
- **F8 — Language selection**: the user picks one of the 5 major Western languages: **English, Italian, Spanish, French, German**. Default: the browser language if among the 5, otherwise English. The choice governs **output only**:
  1. the language of the generated summary;
  2. the language of the extension UI (widget and options page, via `chrome.i18n`).

  Input reviews are **not** filtered by language: they are read in all languages (`language=all`) for the widest, most representative sample; the model summarizes multilingual input in the chosen language.

  Implementation note: `chrome.i18n.getMessage` always follows the *browser* locale, so the UI uses a runtime translation layer fed by the same `_locales` files. The language selector's own label is deliberately kept in English, so the row stays findable even if the UI ends up in the wrong language.
- **F9 — Configuration presets**: the review selection settings (F2) — mode, count, date range, weights — can be saved as named presets and reloaded from the options page, with JSON export/import to share them across installations. A built-in "Default" preset restores the recommended values.

### Post-MVP

Shipped in **v0.3** (driven by community feedback on what makes Steam reviews hard to use — meme reviews, review bombing, patches changing the picture):

- **Minimum playtime filter**: optionally ignore reviews below a configurable hours-played threshold (`minPlaytimeHours`, default off), so the summary reflects players who experienced the real progression, not one-line memes.
- **"Current state" trend verdict**: an explicit recent-vs-overall comparison in the summary (`recent_trend`: better/similar/worse than the historical average), rendered as a colored trend line under the sentiment — catches both "a patch broke it" and "radically improved since launch".

Shipped in **v0.4**:

- **Aspect-focused summaries ("filter for my playstyle")**: toggle chips in the widget — Performance, Story, Controls & UI, Pacing & grind, Multiplayer, plus a **free-text custom aspect** (max 40 chars, e.g. "microtransactions", "Steam Deck", "couch co-op") — and the summary gains one block per selected aspect with its own sentiment and a note on what reviews actually say about it. If recent reviews don't meaningfully discuss an aspect, the model must mark it `not_mentioned` rather than invent. The custom text is sanitized and treated strictly as a topic, never as an instruction. The selection persists across games and is part of the cache key. This separates *what reviewers say* from *whether it matters to you* (one player's "repetitive" is another player's "relaxing").

Later:

- Review pool pagination via `cursor` (currently max 100 per fetch), for larger starting samples.
- Firefox support (WebExtensions).
- Sentiment badges on search/wishlist pages.

### Out of scope (permanent)

- Any write towards Steam (reviews, comments, forums).
- User data collection or telemetry.
- Distribution with a bundled API key (everyone uses their own).

## 4. Non-functional requirements

- **Privacy**: no data leaves the browser except the reviews sent to the configured AI provider for summarization. No backend of our own in the MVP.
- **Predictable costs**: aggressive caching; cost estimate in [ARCHITECTURE.md](ARCHITECTURE.md#cost-estimate).
- **Resilience**: if Steam changes the page markup, nothing breaks — review fetching relies on the JSON endpoint and the widget is a fixed overlay that uses no Steam DOM selectors.
- **Localization**: UI and summary in English, Italian, Spanish, French and German in the MVP (see F8).

## 5. Roadmap

| Milestone | Content | Completion criterion | Status |
|---|---|---|---|
| M0 | Repo setup, specification, MV3 scaffolding | Empty extension loadable in Chrome | ✅ Done |
| M1 | F1 + F2: appid detection and review fetch/selection | Selected reviews logged in console on a game page | ✅ Done |
| M2 | F3 + F7 (partial): provider abstraction + Anthropic adapter + summary prompt | Structured TL;DR JSON in console | ✅ Done |
| M3 | F4 + F5: UI widget and options page | Full end-to-end flow on test games | ✅ Done |
| M4 | F6 + F8 + F9 + polish: cache, errors, i18n in 5 languages, presets | v0.1 usable daily | ✅ Done |
| M5 | F7 (complete): all provider adapters verified end-to-end | Summary verified with each provider | ✅ Done — verified: Anthropic API, Claude on Azure AI Foundry, GPT-4o on Azure AI Foundry, Google Gemini, local (Ollama + gemma3). The official api.openai.com endpoint uses the exact same code path verified on Azure and local servers, and awaits community confirmation |

## 6. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Steam changes/limits the `appreviews` endpoint | High | It has been a stable public endpoint for years; on rate limiting, backoff and a clear error message |
| Unexpected API costs for the user | Medium | 24h cache, manual activation by default, per-page cost is bounded by the review count setting |
| UI injection fragile to Steam layout changes | None | The widget is a fixed overlay: it uses no Steam DOM selectors |
| Offensive content in input reviews | Low | The prompt instructs the model to summarize themes, not to quote insults verbatim |
