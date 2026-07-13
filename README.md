# Steam TL;DR

Estensione Chrome (Manifest V3) che genera un riassunto **TL;DR delle recensioni più recenti** di un gioco, direttamente sulla sua pagina dello store Steam. Un pannello locale mostra "cosa pensano gli utenti" in poche righe, con pro, contro e sentiment.

> ⚠️ **Principio di conformità**: l'estensione **non pubblica mai nulla su Steam**. Il riassunto è visualizzato solo localmente nel browser dell'utente. Pubblicare recensioni generate da un bot violerebbe le linee guida di Steam ("Non influenzare artificialmente le recensioni"). Vedi [docs/SPECS.md](docs/SPECS.md#conformità-alle-linee-guida-di-steam).

## Come funziona (in breve)

1. L'utente visita una pagina `store.steampowered.com/app/{appid}/...`
2. Il content script inietta un pannello "TL;DR" nella pagina
3. Il service worker scarica le recensioni recenti dall'endpoint JSON pubblico di Steam (`/appreviews/{appid}?json=1`)
4. Le recensioni vengono riassunte tramite la Claude API (chiave API personale dell'utente)
5. Il riassunto appare nel pannello, con cache locale per evitare chiamate ripetute

## Documentazione

- [docs/SPECS.md](docs/SPECS.md) — specifiche funzionali, conformità Steam, requisiti
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — architettura tecnica, API, flussi dati, costi

## Stato del progetto

🟡 **Fase di pianificazione** — vedi la [roadmap](docs/SPECS.md#roadmap) nelle specifiche.

## Requisiti

- Chrome / browser Chromium (Manifest V3)
- Una chiave API Anthropic personale (inserita nelle opzioni dell'estensione, mai inclusa nel codice)
