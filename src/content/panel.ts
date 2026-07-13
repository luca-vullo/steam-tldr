// F4 — pannello TL;DR iniettato nella pagina Steam, stile coerente con il
// tema scuro dello store. Vanilla TS, classi con prefisso .stldr- per non
// collidere con il CSS di Steam; il riassunto è SEMPRE renderizzato come
// testo (mai innerHTML da contenuto generato).
import type { TLDRSummary } from "../shared/types";

const t = (key: string, subs?: string[]) => chrome.i18n.getMessage(key, subs);

const SENTIMENT_STYLE: Record<TLDRSummary["sentiment"], { labelKey: string; color: string }> = {
  // Colori delle valutazioni recensioni di Steam
  positive: { labelKey: "sentimentPositive", color: "#66c0f4" },
  mixed: { labelKey: "sentimentMixed", color: "#b9a074" },
  negative: { labelKey: "sentimentNegative", color: "#a34c25" },
};

const CSS = `
.stldr-panel {
  font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
  background: linear-gradient(135deg, rgba(42, 71, 94, 0.55) 0%, rgba(23, 36, 48, 0.9) 60%);
  border-radius: 4px;
  padding: 12px 16px 14px;
  margin: 16px 0;
  color: #c6d4df;
  font-size: 13px;
  line-height: 1.55;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.35);
}
.stldr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stldr-title {
  color: #fff;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0;
  font-weight: 400;
}
.stldr-title .stldr-ai {
  color: #66c0f4;
  font-weight: 700;
}
.stldr-generate {
  display: inline-block;
  border: none;
  border-radius: 2px;
  padding: 6px 14px;
  cursor: pointer;
  color: #d2efa9;
  background: linear-gradient(to right, #75b022 5%, #588a1b 95%);
  font-size: 13px;
}
.stldr-generate:hover {
  color: #fff;
  background: linear-gradient(to right, #8ed629 5%, #6aa621 95%);
}
.stldr-regenerate {
  border: none;
  border-radius: 2px;
  padding: 3px 10px;
  cursor: pointer;
  color: #66c0f4;
  background: rgba(103, 193, 245, 0.15);
  font-size: 11px;
}
.stldr-regenerate:hover { color: #fff; background: rgba(103, 193, 245, 0.35); }
.stldr-body { margin-top: 10px; }
.stldr-loading { display: flex; align-items: center; gap: 10px; color: #8f98a0; padding: 6px 0; }
.stldr-spinner {
  width: 16px; height: 16px;
  border: 2px solid rgba(102, 192, 244, 0.25);
  border-top-color: #66c0f4;
  border-radius: 50%;
  animation: stldr-spin 0.8s linear infinite;
  flex: none;
}
@keyframes stldr-spin { to { transform: rotate(360deg); } }
.stldr-verdict { color: #fff; font-size: 15px; margin: 2px 0 8px; }
.stldr-sentiment { font-weight: 700; }
.stldr-cols { display: flex; gap: 18px; flex-wrap: wrap; }
.stldr-col { flex: 1 1 180px; min-width: 160px; }
.stldr-col h4 {
  margin: 8px 0 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 400;
}
.stldr-col.stldr-pros h4 { color: #a4d007; }
.stldr-col.stldr-cons h4 { color: #cd5444; }
.stldr-list { margin: 0; padding: 0; list-style: none; }
.stldr-list li { padding-left: 16px; position: relative; margin-bottom: 3px; }
.stldr-pros .stldr-list li::before { content: "+"; position: absolute; left: 0; color: #a4d007; font-weight: 700; }
.stldr-cons .stldr-list li::before { content: "–"; position: absolute; left: 0; color: #cd5444; font-weight: 700; }
.stldr-changes {
  margin-top: 10px;
  padding: 8px 10px;
  background: rgba(102, 192, 244, 0.08);
  border-left: 2px solid #66c0f4;
  border-radius: 0 2px 2px 0;
}
.stldr-changes b { color: #66c0f4; font-weight: 700; display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
.stldr-error { color: #cd5444; padding: 4px 0; }
.stldr-options-link { color: #66c0f4; text-decoration: none; }
.stldr-options-link:hover { color: #fff; }
.stldr-footer {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #8f98a0;
  font-size: 11px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}
`;

export interface TLDRPanel {
  element: HTMLElement;
  setIdle(): void;
  setLoading(): void;
  setResult(summary: TLDRSummary, reviewsUsed: number): void;
  setError(message: string, missingKey: boolean): void;
}

export function createPanel(onGenerate: () => void): TLDRPanel {
  const root = document.createElement("div");
  root.className = "stldr-panel";

  const style = document.createElement("style");
  style.textContent = CSS;

  const header = document.createElement("div");
  header.className = "stldr-header";
  const title = document.createElement("h3");
  title.className = "stldr-title";
  const ai = document.createElement("span");
  ai.className = "stldr-ai";
  ai.textContent = "TL;DR ";
  title.append(ai, document.createTextNode(t("panelTitle")));
  header.append(title);

  const body = document.createElement("div");
  body.className = "stldr-body";

  root.append(style, header, body);

  function clear(): void {
    body.replaceChildren();
    header.querySelector(".stldr-regenerate")?.remove();
  }

  function addRegenerate(): void {
    const btn = document.createElement("button");
    btn.className = "stldr-regenerate";
    btn.textContent = t("panelRegenerate");
    btn.addEventListener("click", onGenerate);
    header.append(btn);
  }

  function setIdle(): void {
    clear();
    const btn = document.createElement("button");
    btn.className = "stldr-generate";
    btn.textContent = t("panelGenerate");
    btn.addEventListener("click", onGenerate);
    const hint = document.createElement("div");
    hint.className = "stldr-footer";
    hint.textContent = t("panelIdleHint");
    body.append(btn, hint);
  }

  function setLoading(): void {
    clear();
    const row = document.createElement("div");
    row.className = "stldr-loading";
    const spinner = document.createElement("div");
    spinner.className = "stldr-spinner";
    const text = document.createElement("span");
    text.textContent = t("panelLoading");
    row.append(spinner, text);
    body.append(row);
  }

  function setResult(summary: TLDRSummary, reviewsUsed: number): void {
    clear();

    const sentiment = SENTIMENT_STYLE[summary.sentiment];
    const verdict = document.createElement("p");
    verdict.className = "stldr-verdict";
    verdict.textContent = summary.verdict;

    const sentimentEl = document.createElement("div");
    const sentimentLabel = document.createElement("span");
    sentimentLabel.className = "stldr-sentiment";
    sentimentLabel.style.color = sentiment.color;
    sentimentLabel.textContent = t(sentiment.labelKey);
    sentimentEl.append(sentimentLabel);

    const cols = document.createElement("div");
    cols.className = "stldr-cols";
    cols.append(
      buildList("stldr-pros", t("panelPros"), summary.pros),
      buildList("stldr-cons", t("panelCons"), summary.cons),
    );

    body.append(verdict, sentimentEl, cols);

    if (summary.recent_changes) {
      const changes = document.createElement("div");
      changes.className = "stldr-changes";
      const label = document.createElement("b");
      label.textContent = t("panelRecentChanges");
      changes.append(label, document.createTextNode(summary.recent_changes));
      body.append(changes);
    }

    const footer = document.createElement("div");
    footer.className = "stldr-footer";
    footer.textContent = t("panelDisclosure", [String(reviewsUsed)]);
    body.append(footer);

    addRegenerate();
  }

  function setError(message: string, missingKey: boolean): void {
    clear();
    const error = document.createElement("div");
    error.className = "stldr-error";
    error.textContent = missingKey ? t("panelMissingKey") : t("panelGenericError");
    body.append(error);

    if (missingKey) {
      const link = document.createElement("a");
      link.className = "stldr-options-link";
      link.href = chrome.runtime.getURL("src/options/options.html");
      link.target = "_blank";
      link.textContent = t("panelOpenOptions");
      body.append(link);
    } else {
      console.error("[steam-tldr]", message);
      addRegenerate();
    }
  }

  return { element: root, setIdle, setLoading, setResult, setError };
}

function buildList(className: string, heading: string, items: string[]): HTMLElement {
  const col = document.createElement("div");
  col.className = `stldr-col ${className}`;
  const h = document.createElement("h4");
  h.textContent = heading;
  const ul = document.createElement("ul");
  ul.className = "stldr-list";
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item;
    ul.append(li);
  }
  col.append(h, ul);
  return col;
}
