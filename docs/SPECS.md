# Specifiche funzionali — Steam TL;DR

## 1. Visione

Aiutare chi sta valutando l'acquisto di un gioco su Steam a capire rapidamente **cosa pensano gli utenti adesso**, riassumendo le recensioni più recenti in un TL;DR leggibile in 20 secondi: sentiment generale, punti di forza ricorrenti, lamentele ricorrenti, e note su patch/aggiornamenti recenti se emergono dalle recensioni.

## 2. Conformità alle linee guida di Steam

Questa è la decisione di design più importante del progetto.

### Cosa NON facciamo (e perché)

| Idea scartata | Linea guida Steam violata |
|---|---|
| Pubblicare il riassunto come recensione su Steam tramite bot | "Non influenzare artificialmente le recensioni" — recensioni automatizzate/multiple sono esplicitamente vietate |
| Postare il riassunto nelle discussioni della Comunità | Contenuti fuori tema / spam; le recensioni devono riflettere l'esperienza personale di gioco |
| Includere link o promozioni nel contenuto generato | "I contenuti commerciali non sono consentiti" |

### Cosa facciamo

- **Solo visualizzazione locale**: il riassunto vive in un overlay/pannello iniettato nel DOM della pagina, visibile solo all'utente che ha installato l'estensione. Nulla viene mai inviato a Steam.
- **Solo lettura da endpoint pubblici**: le recensioni sono lette dall'endpoint JSON pubblico e documentato di Steam (`https://store.steampowered.com/appreviews/{appid}?json=1`), lo stesso usato dalla pagina store. Niente scraping aggressivo, niente login, niente automazione dell'account dell'utente.
- **Rate limiting cortese**: massimo due fetch per pagina visitata (una sola nelle modalità di selezione non ibride, vedi F2), con cache locale (default 24h) per non martellare i server di Steam.
- **Trasparenza**: il pannello dichiara chiaramente che il testo è un riassunto generato da AI a partire dalle recensioni degli utenti, con conteggio e periodo delle recensioni analizzate.

## 3. Funzionalità

### MVP (v0.1)

- **F1 — Rilevamento pagina gioco**: il content script si attiva su `store.steampowered.com/app/{appid}/*` ed estrae l'`appid` dall'URL.
- **F2 — Fetch e selezione recensioni**: recupero delle recensioni in tutte le lingue (`language=all`) e selezione delle più recenti/rilevanti da inviare al modello. La strategia è **configurabile** (per poterla tarare sperimentando), con default la modalità ibrida:
  - **modalità**: `hybrid` (default — unione di "più utili nel range di date" e "più recenti"), `recent_scored` (solo recenti + scoring client-side), `steam_native` (ranking di utilità fatto da Steam);
  - **numero di recensioni** inviate al modello (default 50);
  - **range di date** per la componente "utili" (default 30 giorni);
  - **pesi dello scoring** client-side: utilità, ore di gioco, lunghezza del testo, freschezza (default 0.4 / 0.3 / 0.2 / 0.1).

  Dettagli del motore di selezione in [ARCHITECTURE.md](ARCHITECTURE.md#3-sorgente-dati-endpoint-recensioni-di-steam).
- **F3 — Riassunto AI**: una chiamata al provider LLM configurato produce un TL;DR strutturato: verdetto in una riga, sentiment (positivo/misto/negativo), 3–5 pro, 3–5 contro, eventuale nota su patch recenti.
- **F4 — Pannello UI**: pannello collassabile iniettato sotto il box "Recensioni" nativo di Steam, con stile coerente al tema scuro dello store. Stati: caricamento, risultato, errore (chiave mancante, rete, ecc.).
- **F5 — Opzioni**: pagina opzioni per: scelta del provider AI e relative chiavi API (vedi F7, salvate in `chrome.storage.local`), modello, lingua (vedi F8), impostazioni di selezione recensioni con preset (vedi F2 e F9), durata cache, attivazione automatica vs. click manuale (default: click manuale).
- **F6 — Cache**: riassunti salvati per `appid` + lingua + provider/modello con TTL configurabile (default 24h), per evitare costi e latenza sulle visite ripetute.
- **F7 — Multi-provider a profili**: l'utente definisce uno o più **profili provider** (nome, tipo, endpoint, chiave API, modello/deployment) e sceglie quello attivo; le chiavi degli altri profili restano salvate. Un profilo è protocollo + endpoint, quindi lo stesso protocollo copre più deployment:
  - **Protocollo Anthropic** — Claude API (default) oppure Claude deployato su **Azure AI Foundry** (endpoint della risorsa + nome deployment)
  - **Protocollo OpenAI-compatibile** — OpenAI ufficiale, modelli su **Azure AI Foundry** (endpoint OpenAI v1) oppure **modelli locali** (Ollama, LM Studio e qualsiasi server OpenAI-compatibile; chiave API opzionale)
  - **Google Gemini** — Gemini API

  Per gli endpoint personalizzati (Azure, locali) il permesso host viene richiesto a runtime solo per l'origin del profilo. L'implementazione è un'astrazione a adapter per protocollo: il resto dell'estensione parla con un'interfaccia unica (vedi [ARCHITECTURE.md](ARCHITECTURE.md#4-riassunto-livello-provider-llm)).
- **F8 — Selezione lingua**: l'utente sceglie la lingua tra le 5 maggiori lingue occidentali: **italiano, inglese, spagnolo, francese, tedesco**. Default: la lingua del browser se tra le 5, altrimenti inglese. La scelta governa **solo l'output**:
  1. la lingua del riassunto generato;
  2. la lingua della UI dell'estensione (pannello e pagina opzioni, via `chrome.i18n`).

  Le recensioni in input **non** sono filtrate per lingua: si leggono in tutte le lingue (`language=all`) per avere il campione più ampio e rappresentativo; il modello riassume input multilingue nella lingua scelta.
- **F9 — Preset di configurazione**: l'insieme delle impostazioni di selezione recensioni (F2) — modalità, numero, range di date, pesi — si può salvare come preset con nome e ricaricare dalla pagina opzioni, con export/import in JSON per condividerli tra installazioni. Un preset "Default" incorporato ripristina i valori consigliati.

### Post-MVP (v0.2+)

- Paginazione del pool recensioni via `cursor` (oggi max 100 per fetch), per campioni di partenza più ampi.

- Confronto "recenti vs. complessive" (le recenti divergono dal punteggio storico? es. review bombing o gioco migliorato dopo una patch).
- Riassunto on-demand di un aspetto specifico ("cosa dicono delle performance?").
- Supporto Firefox (WebExtensions).
- Badge di sentiment nelle pagine di ricerca/wishlist.

### Fuori scope (permanente)

- Qualsiasi scrittura verso Steam (recensioni, commenti, forum).
- Raccolta di dati degli utenti o telemetria.
- Distribuzione con chiave API inclusa (ognuno usa la propria).

## 4. Requisiti non funzionali

- **Privacy**: nessun dato lascia il browser eccetto le recensioni inviate al provider AI configurato per il riassunto. Nessun backend proprio nell'MVP.
- **Costi prevedibili**: cache aggressiva; stima costi in [ARCHITECTURE.md](ARCHITECTURE.md#stima-costi).
- **Resilienza**: se Steam cambia il markup della pagina, il fetch delle recensioni continua a funzionare (dipendiamo dall'endpoint JSON, non dal DOM); solo il punto di iniezione del pannello è sensibile al markup, con fallback a fine pagina.
- **Localizzazione**: UI e riassunto in italiano, inglese, spagnolo, francese e tedesco nell'MVP (vedi F8).

## 5. Roadmap

| Milestone | Contenuto | Criterio di completamento |
|---|---|---|
| M0 | Setup repo, specifiche, scaffolding MV3 | Estensione vuota caricabile in Chrome |
| M1 | F1 + F2: rilevamento appid e fetch recensioni | Log delle recensioni in console su una pagina gioco |
| M2 | F3 + F7 (parziale): livello provider astratto + adapter Anthropic + prompt di riassunto | JSON strutturato del TL;DR in console |
| M3 | F4 + F5: pannello UI e pagina opzioni | Flusso completo end-to-end su 5 giochi di test |
| M4 | F6 + F8 + F9 + rifiniture: cache, errori, i18n nelle 5 lingue, preset | v0.1 utilizzabile quotidianamente |
| M5 | F7 (completo): adapter OpenAI, Gemini, Azure AI Foundry | Riassunto end-to-end verificato con ciascun provider |

## 6. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Steam modifica/limita l'endpoint `appreviews` | Alto | È un endpoint pubblico stabile da anni; in caso di rate limit, backoff e messaggio d'errore chiaro |
| Costi API inattesi per l'utente | Medio | Cache 24h, attivazione manuale opzionale, stima costi visibile nelle opzioni |
| Iniezione UI fragile al cambio di layout Steam | Basso | Selettori con fallback; il valore dell'estensione non dipende dal punto esatto di iniezione |
| Recensioni con contenuti offensivi in input | Basso | Il prompt istruisce il modello a riassumere i temi, non a citare testualmente insulti |
