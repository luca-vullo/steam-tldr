import type { Message, MessageResponse } from "../shared/types";

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse: (r: MessageResponse) => void) => {
    if (message.type === "ping") {
      sendResponse({ type: "pong", appid: message.appid });
    }
    return false;
  },
);
