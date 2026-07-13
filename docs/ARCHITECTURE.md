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
        store.steampowered.com          api.anthropic.com   chrome.storage
        /appreviews/{appid}?json=1      /v1/messages         (chiave, opzioni,
        (recensioni recenti)            (riassunto)           cache riassunti)
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
│   │   ├── summarizer.ts     # client Claude API + prompt
│   │   └── cache.ts          # cache TTL su chrome.storage.local
│   ├── content/
│   │   ├── index.ts          # rilevamento appid, ciclo di vita
│   │   └── panel.ts          # componente pannello TL;DR
│   ├── options/
│   │   ├── options.html
│   │   └── options.ts
│   └── shared/
│       ├── types.ts          # tipi messaggi e TLDRSummary
│       └── i18n.ts
├── docs/
└── (tooling: vite + @crxjs o esbuild, da decidere in M0)
```

### manifest.json (punti chiave)

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "host_permissions": [
    "https://store.steampowered.com/appreviews/*",
    "https://api.anthropic.com/*"
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
    &filter=recent          // ordinate per data
    &language=italian       // o "all" come fallback
    &num_per_page=50        // max 100
    &purchase_type=all
```

Campi usati per ogni recensione: `review` (testo), `voted_up` (bool), `author.playtime_forever`, `timestamp_created`, `votes_up`. Il campo `query_summary` fornisce anche `review_score_desc` (es. "Very Positive") e i totali, utili per il confronto recenti/complessive in v0.2.

Politica d'uso: 1 richiesta per visita di pagina (poi cache), `User-Agent` di default del browser, nessuna paginazione aggressiva nell'MVP.

## 4. Riassunto: Claude API

### Chiamata

- SDK: `@anthropic-ai/sdk` dal service worker, con `dangerouslyAllowBrowser: true` — accettabile perché la chiave è **dell'utente**, inserita da lui nelle opzioni e salvata in `chrome.storage.local`; non c'è nessuna chiave nostra da proteggere né un backend da cui nasconderla.
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

### Modello

| Modello | ID | Input $/1M | Output $/1M | Uso |
|---|---|---|---|---|
| **Claude Opus 4.8** (default) | `claude-opus-4-8` | $5.00 | $25.00 | Qualità massima del riassunto |
| Claude Haiku 4.5 (opzione economica) | `claude-haiku-4-5` | $1.00 | $5.00 | Selezionabile nelle opzioni |

Parametri: `max_tokens: 2000`, niente `temperature` (rimossa sui modelli correnti), thinking adattivo di default.

### Stima costi

Ipotesi: 50 recensioni ≈ 10–15k token input, ~500 token output.

| Modello | Costo per riassunto | 100 giochi/mese |
|---|---|---|
| Opus 4.8 | ~$0.06–0.09 | ~$6–9 |
| Haiku 4.5 | ~$0.012–0.018 | ~$1.20–1.80 |

Con la cache a 24h le visite ripetute allo stesso gioco costano zero. La stima per riassunto sarà mostrata nella pagina opzioni.

## 5. Cache

`chrome.storage.local`, chiave `summary:{appid}:{lang}:{model}`, valore `{ summary, createdAt, reviewCount }`. TTL default 24h (configurabile). Invalidazione manuale con pulsante "Rigenera" nel pannello. `chrome.storage.local` ha limite ~10MB: eviction LRU oltre le ~200 voci.

## 6. Gestione errori

| Errore | Comportamento UI |
|---|---|
| Chiave API mancante/invalida (401) | Pannello con link diretto alla pagina opzioni |
| Rate limit Claude (429) | Messaggio "riprova tra X secondi" (header `retry-after`) |
| Endpoint Steam irraggiungibile / vuoto | "Recensioni non disponibili per questo titolo" |
| `stop_reason: refusal` / `max_tokens` | Messaggio generico "riassunto non disponibile", log in console |
| Gioco con <5 recensioni recenti | Il riassunto viene comunque prodotto ma con avviso "campione ridotto" |

## 7. Sicurezza e privacy

- La chiave API non compare mai nel codice, nei log o nel repo; vive solo in `chrome.storage.local`.
- Nessuna telemetria, nessun server proprio, nessun dato personale trattato: verso Anthropic viaggiano solo testi di recensioni pubbliche.
- Il testo delle recensioni è input non fidato: il pannello renderizza il riassunto come testo (mai `innerHTML` da contenuto generato), e il prompt tratta le recensioni come dati, non come istruzioni.

## 8. Decisioni aperte (da chiudere in M0)

1. **Tooling di build**: Vite + CRXJS vs. esbuild puro (propendo per Vite+CRXJS: HMR sul content script).
2. **UI del pannello**: vanilla TS vs. Preact (propendo per vanilla nell'MVP: un solo componente).
3. **Attivazione**: automatica al caricamento pagina vs. click sul pannello collassato (propendo per click manuale come default: zero costi involontari).
