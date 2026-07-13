import type { Message, MessageResponse } from "../shared/types";
import { createPanel } from "./panel";

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

// Punto di iniezione: sotto il box "glance" della colonna destra (che
// contiene le valutazioni recensioni). Fallback: sopra la descrizione del
// gioco, poi in fondo al contenuto pagina (F4 / requisito di resilienza).
function injectPanel(panelEl: HTMLElement): void {
  const glance = document.querySelector(".rightcol .glance_ctn");
  if (glance) {
    glance.after(panelEl);
    console.log("[steam-tldr] pannello iniettato sotto il box recensioni");
    return;
  }
  const description = document.querySelector("#game_area_description");
  if (description) {
    description.before(panelEl);
    console.log("[steam-tldr] pannello iniettato sopra la descrizione (fallback)");
    return;
  }
  (document.querySelector(".page_content_ctn") ?? document.body).append(panelEl);
  console.log("[steam-tldr] pannello iniettato a fine pagina (fallback)");
}

function send(message: Message, onResponse: (r: MessageResponse) => void): void {
  chrome.runtime.sendMessage(message, onResponse);
}

const appid = extractAppId(location.href);
if (appid) {
  const gameName = extractGameName();

  const panel = createPanel(generate);
  injectPanel(panel.element);
  panel.setIdle();

  // F5 — attivazione automatica opzionale (default: click manuale)
  chrome.storage.local.get("autoGenerate").then((stored) => {
    if (stored["autoGenerate"] === true) generate();
  });

  function generate(): void {
    panel.setLoading();
    send({ type: "summarize", appid: appid!, gameName }, (response) => {
      if (response.type === "summary") {
        panel.setResult(response.summary, response.reviewsUsed);
        return;
      }
      if (response.type === "error") {
        panel.setError(response.message, response.code === "missing_api_key");
        return;
      }
    });
  }
}
