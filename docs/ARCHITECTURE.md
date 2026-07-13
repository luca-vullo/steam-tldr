# Architettura tecnica — Steam TL;DR

## 1. Panoramica

Estensione Chrome **Manifest V3**, TypeScript, senza backend proprio. Tre componenti:

```
┌─────────────────────────────────────────────────────────────┐
│ Pagina Steam (store.steampowered.com/app/{appid}/...)       │
│                                                              │
│  ┌────────────────────┐    messaggi     ┌─────────────────┐ │
│  │ Content script      │ ◄────────────► │ Service worker  │ │
│  │ - estrae appid      │  chrome.runtime │ (background)    │ │
│  │ - inietta pannello  │                │ - fetch Steam   │ │
│  │ - render TL;DR      │                │ - chiama Claude │ │
│  └────────────────────┘                │ - gestisce cache │ │
│                                         └───────┬─────────┘ │
└─────────────────────────────────────────────────┼───────────┘
                                                  │
                    ┌─────────────────────────────┼──────────────┐
                    ▼                             ▼              ▼
        store.steampowered.com          provider LLM         chrome.storage
        /appreviews/{appid}?json=1      Anthropic / OpenAI /  (chiavi, opzioni,
        (recensioni recenti)            Gemini / Azure AI     cache riassunti)
                                        Foundry (riassunto)
```

Le chiamate di rete vivono **solo nel service worker**: il content script non ha permessi host extra e comunica via `chrome.runtime.sendMessage`.

## 2. Struttura del repository (prevista)

```
steam-tldr/
├── manifest.json
├── src/
│   ├── background/
│   │   ├── index.ts          # router messaggi
│   │   ├── steam.ts          # client endpoint appreviews
│   │   ├── summarizer.ts     # prompt + orchestrazione (provider-agnostico)
│   │   ├── providers/
│   │   │   ├── types.ts      # interfaccia LLMProvider, schema TLDR, parsing
│   │   │   ├── anthropic.ts  # protocollo Anthropic (API + Azure Foundry)
│   │   │   ├── openai.ts     # protocollo OpenAI-compatibile (OpenAI/Azure/locali)
│   │   │   └── gemini.ts     # Google Gemini
│   │   └── cache.ts          # cache TTL su chrome.storage.local
│   ├── content/
│   │   ├── index.ts          # rilevamento appid, ciclo di vita
│   │   └── panel.ts          # componente pannello TL;DR
│   ├── options/
│   │   ├── options.html
│   │   └── options.ts
│   └── shared/
│       ├── types.ts          # tipi messaggi e TLDRSummary
│       └── i18n.ts           # lingua attiva per UI e output (F8)
├── _locales/                 # messaggi UI per chrome.i18n (F8)
│   ├── it/messages.json
│   ├── en/messages.json      # default_locale
│   ├── es/messages.json
│   ├── fr/messages.json
│   └── de/messages.json
├── docs/
├── vite.config.ts            # Vite + @crxjs/vite-plugin
├── tsconfig.json
└── package.json
```

### manifest.json (punti chiave)

```json
{
  "manifest_version": 3,
  "default_locale": "en",
  "permissions": ["storage"],
  "host_permissions": [
    "https://store.steampowered.com/appreviews/*",
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "optional_host_permissions": [
    "https://*/*",
    "http://localhost/*",
    "http://127.0.0.1/*"
  ],
  "content_scripts": [{
    "matches": ["https://store.steampowered.com/app/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }],
  "background": { "service_worker": "background.js" },
  "options_page": "options.html"
}
```

## 3. Sorgente dati: endpoint recensioni di Steam

Endpoint JSON pubblico, lo stesso usato dal sito:

```
GET https://store.steampowered.com/appreviews/{appid}
    ?json=1
    &filter=recent|all      // vedi modalità sotto
    &language=all           // input multilingue: la lingua (F8) governa solo l'output
    &num_per_page=100       // max 100; poi selezione client-side
    &purchase_type=all
    &day_range=30           // solo con filter=all
```

Campi usati per ogni recensione: `recommendationid` (dedup), `review` (testo), `voted_up` (bool), `author.playtime_forever`, `timestamp_created`, `votes_up`, `weighted_vote_score` (utilità 0–1 calcolata da Steam). Il campo `query_summary` fornisce anche `review_score_desc` (es. "Very Positive") e i totali, utili per il confronto recenti/complessive in v0.2.

### Motore di selezione recensioni (F2)

La selezione delle recensioni da inviare al modello è guidata da una configurazione (salvabile come preset, F9):

```ts
interface ReviewSelectionConfig {
  mode: "hybrid" | "recent_scored" | "steam_native";  // default: hybrid
  numReviews: number;   // recensioni inviate al modello — default 50
  dayRange: number;     // finestra per la componente "utili" — default 30 (max 365)
  weights: {            // pesi dello scoring client-side (somma 1)
    helpfulness: number;  // default 0.4 — weighted_vote_score
    playtime: number;     // default 0.3 — log(ore di gioco), normalizzato
    substance: number;    // default 0.2 — lunghezza testo, con tetto
    freshness: number;    // default 0.1 — decadimento lineare su dayRange
  };
  minChars: number;     // scarta recensioni più corte — default 30
}
```

Comportamento per modalità:

| Modalità | Fetch | Selezione |
|---|---|---|
| `hybrid` (default) | 2: `filter=all&day_range={dayRange}` (utili) + `filter=recent` (fresche) | Merge con dedup su `recommendationid`, scoring pesato su tutto il pool, top `numReviews` |
| `recent_scored` | 1: `filter=recent` | Scoring pesato, top `numReviews` |
| `steam_native` | 1: `filter=all&day_range={dayRange}` | Ordine di Steam, prime `numReviews`; fallback a `filter=recent` se <10 risultati |

Regole comuni, applicate prima dello scoring:

- recensioni con meno di `minChars` caratteri scartate (i "+1" senza contenuto);
- il campione finale **preserva la proporzione reale positive/negative** del pool, per non distorcere il sentiment;
- le recensioni molto fresche hanno pochi voti: `helpfulness` mancante o nulla non azzera lo score (si rinormalizzano gli altri pesi).

La configurazione attiva concorre alla chiave di cache (hash della config), così cambiare preset rigenera il riassunto invece di servire quello calcolato con un'altra selezione.

Politica d'uso: al massimo 2 richieste per visita di pagina (1 nelle modalità non ibride), poi cache; `User-Agent` di default del browser, nessuna paginazione aggressiva nell'MVP.

## 4. Riassunto: livello provider LLM

### Profili provider (F7)

Il summarizer è provider-agnostico: costruisce il prompt e delega la chiamata a un adapter **per protocollo**. L'utente definisce **profili** (protocollo + endpoint + chiave + modello) e sceglie quello attivo; i profili vivono in `chrome.storage.local`.

```ts
type ProviderKind = "anthropic" | "openai_compat" | "gemini";

interface ProviderProfile {
  id: string;
  name: string;     // etichetta scelta dall'utente
  kind: ProviderKind;
  baseUrl: string;  // "" = endpoint di default del protocollo
  apiKey: string;   // può essere vuota per server locali
  model: string;    // ID modello, o nome del deployment su Azure Foundry
}

interface LLMProvider {
  kind: ProviderKind;
  summarize(req: SummarizeRequest, profile: ProviderProfile): Promise<TLDRSummary>;
}
```

Ogni adapter è responsabile di ottenere un JSON conforme allo schema `TLDRSummary` con il meccanismo nativo del protocollo; a valle, un'unica validazione dello schema.

| Protocollo | Copre | Client | Output strutturato |
|---|---|---|---|
| `anthropic` | Claude API (default); **Claude su Azure AI Foundry** (baseUrl = endpoint risorsa, model = nome deployment) | `@anthropic-ai/sdk`; con baseUrl `@anthropic-ai/foundry-sdk` (auth Azure) | Structured outputs (`output_config.format` con JSON schema) |
| `openai_compat` | OpenAI ufficiale; **Azure AI Foundry** (endpoint OpenAI v1); **modelli locali** (Ollama `http://localhost:11434/v1`, LM Studio, ...) | `fetch` diretto su `{baseUrl}/chat/completions` (header `Authorization: Bearer` + `api-key` per compatibilità Azure) | `response_format: json_schema` strict; se l'endpoint lo rifiuta (400), retry con vincolo JSON nel prompt + estrazione/validazione |
| `gemini` | Google Gemini API | `fetch` diretto su `generateContent` | `responseMimeType: application/json` + `responseSchema` (variante senza `anyOf`) |

Permessi host: gli endpoint fissi (Anthropic, OpenAI, Gemini) sono in `host_permissions`; gli endpoint scelti dall'utente (Azure, locali) sono coperti da `optional_host_permissions` ampie, ma il permesso viene richiesto a runtime **solo per l'origin del profilo salvato** (`chrome.permissions.request`), mai in blocco.

### Adapter Anthropic (default)

- SDK: `@anthropic-ai/sdk` dal service worker, con `dangerouslyAllowBrowser: true` — accettabile perché la chiave è **dell'utente**, inserita da lui nelle opzioni e salvata in `chrome.storage.local`; non c'è nessuna chiave nostra da proteggere né un backend da cui nasconderla. Con baseUrl impostato (Claude su Azure AI Foundry) si usa `@anthropic-ai/foundry-sdk`, che gestisce l'autenticazione Azure con la stessa superficie `messages.create`.
- **Structured outputs** (`output_config.format` con JSON schema) per ottenere un oggetto `TLDRSummary` sempre parsabile, senza prefill (non supportato sui modelli correnti).

### Schema output

```ts
interface TLDRSummary {
  verdict: string;          // una riga, es. "Ottimo roguelike, ma il netcode fa arrabbiare"
  sentiment: "positive" | "mixed" | "negative";
  pros: string[];           // 3–5 punti ricorrenti
  cons: string[];           // 3–5 punti ricorrenti
  recent_changes?: string;  // note su patch/update se emergono dalle recensioni
  reviews_analyzed: number;
  language: string;
}
```

### Prompt (bozza)

System: ruolo di analista neutrale; istruzioni a riassumere **temi ricorrenti** (non opinioni singole), a non citare testualmente insulti o contenuti offensivi, a segnalare se le recensioni sono poche o contrastanti, a rispondere nella lingua richiesta.

User: metadati del gioco (nome, `review_score_desc`) + le N recensioni come lista JSON compattata (testo troncato a ~1500 caratteri l'una, con `voted_up` e ore di gioco).

### Modelli

Per Anthropic (default):

| Modello | ID | Input $/1M | Output $/1M | Uso |
|---|---|---|---|---|
| **Claude Opus 4.8** (default) | `claude-opus-4-8` | $5.00 | $25.00 | Qualità massima del riassunto |
| Claude Haiku 4.5 (opzione economica) | `claude-haiku-4-5` | $1.00 | $5.00 | Selezionabile nelle opzioni |

Parametri: `max_tokens: 4000`, niente `temperature` (rimossa sui modelli correnti), nessun parametro `thinking` (così l'adapter funziona con tutti i modelli Claude: Haiku 4.5 non supporta l'adattivo, e per un riassunto il thinking non è necessario).

Per OpenAI, Gemini e Azure AI Foundry il modello è un campo libero nelle opzioni (con suggerimenti aggiornati alla release): gli ID modello di questi provider cambiano di frequente e non vanno cablati nel codice.

### Stima costi

Ipotesi: 50 recensioni ≈ 10–15k token input, ~500 token output.

| Modello | Costo per riassunto | 100 giochi/mese |
|---|---|---|
| Opus 4.8 | ~$0.06–0.09 | ~$6–9 |
| Haiku 4.5 | ~$0.012–0.018 | ~$1.20–1.80 |

Per gli altri provider il costo dipende dal modello scelto dall'utente e dal listino del provider; l'ordine di grandezza resta lo stesso (10–15k token input per riassunto). Con la cache a 24h le visite ripetute allo stesso gioco costano zero. La stima per riassunto sarà mostrata nella pagina opzioni.

## 5. Cache

`chrome.storage.local`, chiave `summary:{appid}:{lang}:{profileId}:{model}:{selectionHash}` (hash della `ReviewSelectionConfig` attiva), valore `{ summary, createdAt, reviewCount }`. TTL default 24h (configurabile). Invalidazione manuale con pulsante "Rigenera" nel pannello. `chrome.storage.local` ha limite ~10MB: eviction LRU oltre le ~200 voci.

## 6. Gestione errori

| Errore | Comportamento UI |
|---|---|
| Chiave API mancante/invalida (401) | Pannello con link diretto alla pagina opzioni |
| Rate limit del provider (429) | Messaggio "riprova tra X secondi" (header `retry-after` se presente) |
| Endpoint Steam irraggiungibile / vuoto | "Recensioni non disponibili per questo titolo" |
| Rifiuto del modello / output troncato o non conforme allo schema (dopo 1 retry) | Messaggio generico "riassunto non disponibile", log in console |
| Endpoint custom: host permission negata dall'utente | Pannello con invito a riautorizzare l'endpoint dalle opzioni |
| Gioco con <5 recensioni recenti | Il riassunto viene comunque prodotto ma con avviso "campione ridotto" |

## 7. Sicurezza e privacy

- Le chiavi API (di qualsiasi provider) non compaiono mai nel codice, nei log o nel repo; vivono solo in `chrome.storage.local`.
- Nessuna telemetria, nessun server proprio, nessun dato personale trattato: verso il provider AI configurato viaggiano solo testi di recensioni pubbliche.
- Ogni chiave viene inviata esclusivamente all'endpoint del proprio provider (host permission dedicata nel manifest; per Azure, richiesta a runtime sull'endpoint specifico della risorsa).
- Il testo delle recensioni è input non fidato: il pannello renderizza il riassunto come testo (mai `innerHTML` da contenuto generato), e il prompt tratta le recensioni come dati, non come istruzioni.

## 8. Decisioni chiuse (2026-07-13)

1. **Tooling di build: Vite + CRXJS**. HMR sul content script e gestione automatica di manifest/asset valgono la dipendenza in più; necessario comunque un bundler per l'SDK Anthropic.
2. **UI del pannello: vanilla TS**. Un solo componente con tre stati (caricamento/risultato/errore) non giustifica un framework; eventuale migrazione a Preact rimandata a v0.2 se la UI cresce.
3. **Attivazione: click manuale come default**. Il pannello appare collassato con un bottone "Genera TL;DR"; zero costi API involontari durante la navigazione. L'attivazione automatica resta disponibile come opzione (F5).
