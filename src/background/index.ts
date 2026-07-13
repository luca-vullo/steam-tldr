import type { Message, MessageResponse } from "../shared/types";
import { loadSelectionConfig } from "../shared/settings";
import { collectReviews } from "./selection";

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (r: MessageResponse) => void) => {
    switch (message.type) {
      case "ping":
        sendResponse({ type: "pong", appid: message.appid });
        return false;

      case "fetchReviews":
        handleFetchReviews(message.appid)
          .then(sendResponse)
          .catch((err: unknown) =>
            sendResponse({ type: "error", message: String(err) }),
          );
        return true; // risposta asincrona
    }
  },
);

async function handleFetchReviews(appid: string): Promise<MessageResponse> {
  const config = await loadSelectionConfig();
  const { selected, querySummary, poolSize } = await collectReviews(appid, config);
  return { type: "reviews", reviews: selected, querySummary, poolSize };
}
