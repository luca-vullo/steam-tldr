// Messaggi content script ⇄ service worker. Per M0 solo il ping di verifica;
// i messaggi reali (fetch recensioni, riassunto) arrivano con M1/M2.
export type Message = { type: "ping"; appid: string };

export type MessageResponse = { type: "pong"; appid: string };
