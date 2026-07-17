import type { Message, MessageResponse } from "../shared/types";
import { initI18n } from "../shared/i18n";
import { loadCustomAspect, loadFocusAspects, loadLanguage } from "../shared/settings";
import { createWidget } from "./panel";

// F1 — extracts the appid from store.steampowered.com/app/{appid}/...
function extractAppId(url: string): string | null {
  const match = url.match(/\/app\/(\d+)/);
  return match?.[1] ?? null;
}

function extractGameName(): string {
  return (
    document.querySelector(".apphub_AppName")?.textContent?.trim() ??
    document.title.replace(/ (on|su) Steam$/i, "").trim()
  );
}

function send(message: Message, onResponse: (r: MessageResponse) => void): void {
  chrome.runtime.sendMessage(message, (response?: MessageResponse) => {
    // If the service worker failed or the channel closed, Chrome invokes the
    // callback with no response and sets lastError: surface an error instead
    // of leaving the widget spinning forever.
    if (chrome.runtime.lastError || !response) {
      const reason = chrome.runtime.lastError?.message ?? "no response from service worker";
      console.error("[steam-tldr]", reason);
      onResponse({ type: "error", code: "generic", message: reason });
      return;
    }
    onResponse(response);
  });
}

const appid = extractAppId(location.href);
if (appid) {
  void initPage(appid);
}

async function initPage(appid: string): Promise<void> {
  // F8 — the widget speaks the user-selected language, not the browser's
  initI18n(await loadLanguage());

  const gameName = extractGameName();

  // F4 — widget independent from the page layout: fixed tab on the right
  // edge + drawer. No Steam markup selectors.
  const widget = createWidget(
    gameName,
    await loadFocusAspects(),
    await loadCustomAspect(),
    generate,
  );
  widget.setIdle();
  console.log("[steam-tldr] widget ready (tab on the right edge)");

  // F5 — optional automatic activation (default: manual click)
  const stored = await chrome.storage.local.get("autoGenerate");
  if (stored["autoGenerate"] === true) generate();

  function generate(force = false): void {
    widget.open();
    widget.setLoading();
    send(
      {
        type: "summarize",
        appid,
        gameName,
        force,
        aspects: widget.getAspects(),
        customAspect: widget.getCustomAspect(),
      },
      (response) => {
      if (response.type === "summary") {
        widget.setResult(response.summary, response.reviewsUsed, response.createdAt);
        return;
      }
      if (response.type === "error") {
        widget.setError(response.message, response.code === "missing_api_key");
        return;
      }
    });
  }
}
