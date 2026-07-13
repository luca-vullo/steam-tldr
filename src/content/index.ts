import type { Message, MessageResponse } from "../shared/types";

// F1 — estrae l'appid da store.steampowered.com/app/{appid}/...
function extractAppId(url: string): string | null {
  const match = url.match(/\/app\/(\d+)/);
  return match?.[1] ?? null;
}

const appid = extractAppId(location.href);
if (appid) {
  console.log(`[steam-tldr] pagina gioco rilevata, appid=${appid}`);
  const message: Message = { type: "ping", appid };
  chrome.runtime.sendMessage(message, (response: MessageResponse) => {
    console.log("[steam-tldr] service worker attivo:", response);
  });
}
