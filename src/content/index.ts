import type { Message, MessageResponse } from "../shared/types";

// F1 — estrae l'appid da store.steampowered.com/app/{appid}/...
function extractAppId(url: string): string | null {
  const match = url.match(/\/app\/(\d+)/);
  return match?.[1] ?? null;
}

const appid = extractAppId(location.href);
if (appid) {
  console.log(`[steam-tldr] pagina gioco rilevata, appid=${appid}`);
  const message: Message = { type: "fetchReviews", appid };
  chrome.runtime.sendMessage(message, (response: MessageResponse) => {
    if (response.type === "error") {
      console.error("[steam-tldr] errore fetch recensioni:", response.message);
      return;
    }
    if (response.type !== "reviews") return;

    const { reviews, querySummary, poolSize } = response;
    const positives = reviews.filter((r) => r.votedUp).length;
    console.log(
      `[steam-tldr] ${reviews.length} recensioni selezionate su un pool di ${poolSize} ` +
        `(${positives} positive, ${reviews.length - positives} negative) — ` +
        `punteggio complessivo Steam: ${querySummary.reviewScoreDesc} ` +
        `(${querySummary.totalPositive}/${querySummary.totalReviews} positive)`,
    );
    console.table(
      reviews.map((r) => ({
        lingua: r.language,
        positiva: r.votedUp,
        voti: r.votesUp,
        ore: Math.round(r.playtimeForeverMin / 60),
        testo: r.text.slice(0, 80).replaceAll("\n", " "),
      })),
    );
  });
}
