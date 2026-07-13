import type { Message, MessageResponse } from "../shared/types";

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
  console.log(`[steam-tldr] pagina gioco rilevata: "${gameName}" (appid=${appid})`);

  send({ type: "summarize", appid, gameName }, (response) => {
    if (response.type === "summary") {
      const { summary, reviewsUsed, poolSize } = response;
      console.log(
        `[steam-tldr] TL;DR generato da ${reviewsUsed} recensioni (pool ${poolSize}):`,
      );
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    if (response.type === "error" && response.code === "missing_api_key") {
      console.warn(`[steam-tldr] ${response.message}`);
      // Senza chiave mostriamo comunque la selezione recensioni (debug M1)
      send({ type: "fetchReviews", appid }, (fallback) => {
        if (fallback.type !== "reviews") return;
        const positives = fallback.reviews.filter((r) => r.votedUp).length;
        console.log(
          `[steam-tldr] ${fallback.reviews.length} recensioni selezionate su un pool di ${fallback.poolSize} ` +
            `(${positives} positive, ${fallback.reviews.length - positives} negative) — ` +
            `punteggio complessivo Steam: ${fallback.querySummary.reviewScoreDesc}`,
        );
        console.table(
          fallback.reviews.map((r) => ({
            lingua: r.language,
            positiva: r.votedUp,
            voti: r.votesUp,
            ore: Math.round(r.playtimeForeverMin / 60),
            testo: r.text.slice(0, 80).replaceAll("\n", " "),
          })),
        );
      });
      return;
    }

    if (response.type === "error") {
      console.error("[steam-tldr] errore:", response.message);
    }
  });
}
