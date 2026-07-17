# Privacy Policy — Steam TL;DR

_Last updated: July 2026_

Steam TL;DR is a browser extension that summarizes a game's recent Steam
reviews using an AI provider configured by the user. This policy describes
what data the extension handles. The short version: **we collect nothing.**

## Data the extension does NOT collect

The extension has no backend, no accounts and no telemetry. The developer
receives **no data whatsoever** from your use of the extension: no analytics,
no crash reports, no usage statistics, no personal information.

## Data stored locally on your device

The following is stored in your browser's local extension storage
(`chrome.storage.local`) and never leaves your machine except as described
below:

- **API keys** you enter for your AI provider profiles
- **Settings** (language, review-selection configuration, presets)
- **Cached summaries** (kept for a configurable time, default 24 hours)

Keys are deliberately kept out of Chrome's sync storage, so they are not
uploaded to your Google account.

## Data sent to third parties

Two categories of network requests happen, both initiated by you:

1. **Steam** (`store.steampowered.com`): the extension reads a game's public
   reviews from Steam's public JSON endpoint. No account data or cookies are
   involved.
2. **Your configured AI provider** (e.g. Anthropic, OpenAI, Google, an Azure
   resource, or a local server you run): the extension sends the selected
   public review texts, the game's name and rating, and your API key for
   authentication — only to the endpoint of the profile you configured.
   Their processing of that request is governed by the provider's own
   privacy policy and your agreement with them.

Nothing else is contacted. This is verifiable in the source code: see the
[security & audit documentation](SECURITY.md).

## Permissions

The extension requests the minimum permissions needed: local storage, access
to Steam's reviews endpoint, the fixed endpoints of the supported AI
providers, and — only when you configure a custom endpoint (an Azure
resource or a local server) — a runtime permission for that specific origin,
which Chrome asks you to approve explicitly.

## Changes and contact

Changes to this policy are tracked in the project's public repository:
https://github.com/luca-vullo/steam-tldr

Questions or concerns: open an issue on the repository.
