import type { Message, MessageResponse } from "../shared/types";
import { createWidget } from "./panel";

// F1 — estrae l'appid da store.steampowered.com/app/{appid}/...
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
  chrome.runtime.sendMessage(message, onResponse);
}

const appid = extractAppId(location.href);
if (appid) {
  const gameName = extractGameName();

  // F4 — widget indipendente dal layout della pagina: linguetta fissa sul
  // bordo destro + drawer. Nessun selettore del markup di Steam.
  const widget = createWidget(gameName, generate);
  widget.setIdle();
  console.log("[steam-tldr] widget pronto (linguetta sul bordo destro)");

  // F5 — attivazione automatica opzionale (default: click manuale)
  chrome.storage.local.get("autoGenerate").then((stored) => {
    if (stored["autoGenerate"] === true) generate();
  });

  function generate(force = false): void {
    widget.open();
    widget.setLoading();
    send({ type: "summarize", appid: appid!, gameName, force }, (response) => {
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
