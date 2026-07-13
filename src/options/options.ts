// F5/F8 — la pagina opzioni vera arriva con M3; per M0 solo i18n di verifica.
for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
  const key = el.dataset["i18n"];
  if (key) el.textContent = chrome.i18n.getMessage(key);
}
