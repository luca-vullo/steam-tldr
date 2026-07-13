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
- **Rate limiting cortese**: massimo una fetch per pagina visitata, con cache locale (default 24h) per non martellare i server di Steam.
- **Trasparenza**: il pannello dichiara chiaramente che il testo è un riassunto generato da AI a partire dalle recensioni degli utenti, con conteggio e periodo delle recensioni analizzate.

## 3. Funzionalità

### MVP (v0.1)

- **F1 — Rilevamento pagina gioco**: il content script si attiva su `store.steampowered.com/app/{appid}/*` ed estrae l'`appid` dall'URL.
- **F2 — Fetch recensioni recenti**: recupero delle ultime ~50 recensioni (`filter=recent`), nella lingua dell'utente con fallback su "all".
- **F3 — Riassunto AI**: una chiamata alla Claude API produce un TL;DR strutturato: verdetto in una riga, sentiment (positivo/misto/negativo), 3–5 pro, 3–5 contro, eventuale nota su patch recenti.
- **F4 — Pannello UI**: pannello collassabile iniettato sotto il box "Recensioni" nativo di Steam, con stile coerente al tema scuro dello store. Stati: caricamento, risultato, errore (chiave mancante, rete, ecc.).
- **F5 — Opzioni**: pagina opzioni per: chiave API Anthropic (salvata in `chrome.storage.local`), modello, lingua del riassunto, numero di recensioni, durata cache, attivazione automatica vs. click manuale.
- **F6 — Cache**: riassunti salvati per `appid` + lingua con TTL configurabile (default 24h), per evitare costi e latenza sulle visite ripetute.

### Post-MVP (v0.2+)

- Confronto "recenti vs. complessive" (le recenti divergono dal punteggio storico? es. review bombing o gioco migliorato dopo una patch).
- Riassunto on-demand di un aspetto specifico ("cosa dicono delle performance?").
- Supporto Firefox (WebExtensions).
- Badge di sentiment nelle pagine di ricerca/wishlist.

### Fuori scope (permanente)

- Qualsiasi scrittura verso Steam (recensioni, commenti, forum).
- Raccolta di dati degli utenti o telemetria.
- Distribuzione con chiave API inclusa (ognuno usa la propria).

## 4. Requisiti non funzionali

- **Privacy**: nessun dato lascia il browser eccetto le recensioni inviate alla Claude API per il riassunto. Nessun backend proprio nell'MVP.
- **Costi prevedibili**: cache aggressiva; stima costi in [ARCHITECTURE.md](ARCHITECTURE.md#stima-costi).
- **Resilienza**: se Steam cambia il markup della pagina, il fetch delle recensioni continua a funzionare (dipendiamo dall'endpoint JSON, non dal DOM); solo il punto di iniezione del pannello è sensibile al markup, con fallback a fine pagina.
- **Localizzazione**: UI e riassunto in italiano e inglese nell'MVP.

## 5. Roadmap

| Milestone | Contenuto | Criterio di completamento |
|---|---|---|
| M0 | Setup repo, specifiche, scaffolding MV3 | Estensione vuota caricabile in Chrome |
| M1 | F1 + F2: rilevamento appid e fetch recensioni | Log delle recensioni in console su una pagina gioco |
| M2 | F3: integrazione Claude API + prompt di riassunto | JSON strutturato del TL;DR in console |
| M3 | F4 + F5: pannello UI e pagina opzioni | Flusso completo end-to-end su 5 giochi di test |
| M4 | F6 + rifiniture: cache, errori, i18n | v0.1 utilizzabile quotidianamente |

## 6. Rischi

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Steam modifica/limita l'endpoint `appreviews` | Alto | È un endpoint pubblico stabile da anni; in caso di rate limit, backoff e messaggio d'errore chiaro |
| Costi API inattesi per l'utente | Medio | Cache 24h, attivazione manuale opzionale, stima costi visibile nelle opzioni |
| Iniezione UI fragile al cambio di layout Steam | Basso | Selettori con fallback; il valore dell'estensione non dipende dal punto esatto di iniezione |
| Recensioni con contenuti offensivi in input | Basso | Il prompt istruisce il modello a riassumere i temi, non a citare testualmente insulti |
