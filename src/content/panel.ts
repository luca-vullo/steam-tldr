// F4 — TL;DR widget independent from Steam's layout: a fixed tab on the
// right edge opens a side drawer. No dependency on the page markup
// (resilience requirement). Vanilla TS, .stldr- prefixed classes; the
// summary is ALWAYS rendered as text (never innerHTML from generated content).
import { ALL_ASPECTS, type AspectId, type AspectSummary, type Message, type TLDRSummary } from "../shared/types";
import { saveFocusAspects } from "../shared/settings";
import { t } from "../shared/i18n";

function openOptions(): void {
  const message: Message = { type: "openOptions" };
  chrome.runtime.sendMessage(message);
}

const SENTIMENT_STYLE: Record<TLDRSummary["sentiment"], { labelKey: string; color: string }> = {
  // Steam's review rating colors
  positive: { labelKey: "sentimentPositive", color: "#66c0f4" },
  mixed: { labelKey: "sentimentMixed", color: "#b9a074" },
  negative: { labelKey: "sentimentNegative", color: "#a34c25" },
};

const TREND_STYLE: Record<
  Exclude<TLDRSummary["recent_trend"], null>,
  { labelKey: string; color: string; arrow: string }
> = {
  better: { labelKey: "trendBetter", color: "#a4d007", arrow: "▲" },
  similar: { labelKey: "trendSimilar", color: "#b9a074", arrow: "▶" },
  worse: { labelKey: "trendWorse", color: "#cd5444", arrow: "▼" },
};

const ASPECT_LABEL_KEYS: Record<AspectId, string> = {
  performance: "aspectPerformance",
  story: "aspectStory",
  controls_ui: "aspectControls",
  pacing: "aspectPacing",
  multiplayer: "aspectMultiplayer",
};

const ASPECT_SENTIMENT_COLORS: Record<AspectSummary["sentiment"], string> = {
  positive: "#a4d007",
  mixed: "#b9a074",
  negative: "#cd5444",
  not_mentioned: "#8f98a0",
};

const CSS = `
.stldr-tab {
  position: fixed;
  right: 0;
  top: 35%;
  z-index: 2147483646;
  writing-mode: vertical-rl;
  padding: 12px 7px;
  border: none;
  border-radius: 4px 0 0 4px;
  cursor: pointer;
  font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #fff;
  background: linear-gradient(180deg, #67c1f5 0%, #2e6a8f 100%);
  box-shadow: -2px 2px 8px rgba(0, 0, 0, 0.5);
}
.stldr-tab:hover { background: linear-gradient(180deg, #8ed1f8 0%, #3c86b4 100%); }

.stldr-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483647;
  width: 380px;
  max-width: 92vw;
  box-sizing: border-box;
  padding: 16px 18px 20px;
  overflow-y: auto;
  transform: translateX(105%);
  transition: transform 0.25s ease;
  font-family: "Motiva Sans", Arial, Helvetica, sans-serif;
  font-size: 13px;
  line-height: 1.55;
  color: #c6d4df;
  background: linear-gradient(180deg, #23405a 0%, #16202d 40%, #10161d 100%);
  box-shadow: -6px 0 18px rgba(0, 0, 0, 0.6);
}
.stldr-drawer.stldr-open { transform: translateX(0); }

.stldr-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}
.stldr-title {
  color: #fff;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin: 0;
  font-weight: 400;
}
.stldr-title .stldr-ai { color: #66c0f4; font-weight: 700; }
.stldr-close, .stldr-gear {
  border: none;
  background: transparent;
  color: #8f98a0;
  font-size: 18px;
  cursor: pointer;
  padding: 2px 6px;
  line-height: 1;
  text-decoration: none;
}
.stldr-close:hover, .stldr-gear:hover { color: #fff; }
.stldr-actions { display: flex; align-items: center; gap: 2px; }
.stldr-game { color: #8f98a0; font-size: 12px; margin: 0 0 8px; }

.stldr-chips-title { color: #8f98a0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 4px; }
.stldr-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }
.stldr-chip {
  border: 1px solid rgba(103, 193, 245, 0.35);
  border-radius: 2px;
  background: rgba(103, 193, 245, 0.08);
  color: #8f98a0;
  font-size: 11px;
  padding: 3px 9px;
  cursor: pointer;
}
.stldr-chip:hover { color: #fff; }
.stldr-chip.stldr-chip-on {
  background: rgba(103, 193, 245, 0.35);
  color: #fff;
  border-color: #66c0f4;
}

.stldr-aspects { margin-top: 14px; }
.stldr-aspect { margin-bottom: 7px; font-size: 12.5px; }
.stldr-aspect b { font-weight: 700; }
.stldr-aspect-dot {
  display: inline-block;
  width: 8px; height: 8px;
  border-radius: 50%;
  margin-right: 6px;
  vertical-align: middle;
}

.stldr-generate {
  display: inline-block;
  border: none;
  border-radius: 2px;
  padding: 8px 18px;
  cursor: pointer;
  color: #d2efa9;
  background: linear-gradient(to right, #75b022 5%, #588a1b 95%);
  font-size: 14px;
}
.stldr-generate:hover {
  color: #fff;
  background: linear-gradient(to right, #8ed629 5%, #6aa621 95%);
}
.stldr-regenerate {
  border: none;
  border-radius: 2px;
  padding: 4px 10px;
  cursor: pointer;
  color: #66c0f4;
  background: rgba(103, 193, 245, 0.15);
  font-size: 11px;
}
.stldr-regenerate:hover { color: #fff; background: rgba(103, 193, 245, 0.35); }

.stldr-loading { display: flex; align-items: center; gap: 10px; color: #8f98a0; padding: 10px 0; }
.stldr-spinner {
  width: 18px; height: 18px;
  border: 2px solid rgba(102, 192, 244, 0.25);
  border-top-color: #66c0f4;
  border-radius: 50%;
  animation: stldr-spin 0.8s linear infinite;
  flex: none;
}
@keyframes stldr-spin { to { transform: rotate(360deg); } }

.stldr-verdict { color: #fff; font-size: 16px; margin: 4px 0 10px; }
.stldr-sentiment { font-weight: 700; }
.stldr-trend { font-size: 12px; margin-top: 3px; }
.stldr-col h4 {
  margin: 14px 0 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 400;
}
.stldr-pros h4 { color: #a4d007; }
.stldr-cons h4 { color: #cd5444; }
.stldr-list { margin: 0; padding: 0; list-style: none; }
.stldr-list li { padding-left: 16px; position: relative; margin-bottom: 4px; }
.stldr-pros .stldr-list li::before { content: "+"; position: absolute; left: 0; color: #a4d007; font-weight: 700; }
.stldr-cons .stldr-list li::before { content: "–"; position: absolute; left: 0; color: #cd5444; font-weight: 700; }
.stldr-changes {
  margin-top: 14px;
  padding: 8px 10px;
  background: rgba(102, 192, 244, 0.08);
  border-left: 2px solid #66c0f4;
  border-radius: 0 2px 2px 0;
}
.stldr-changes b { color: #66c0f4; font-weight: 700; display: block; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
.stldr-error { color: #cd5444; padding: 6px 0; }
.stldr-options-link {
  border: none;
  background: rgba(103, 193, 245, 0.15);
  border-radius: 2px;
  padding: 5px 12px;
  cursor: pointer;
  color: #66c0f4;
  font-size: 13px;
}
.stldr-options-link:hover { color: #fff; background: rgba(103, 193, 245, 0.35); }
.stldr-footer {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  color: #8f98a0;
  font-size: 11px;
}
.stldr-hint { color: #8f98a0; font-size: 12px; margin-top: 10px; }
`;

export interface TLDRWidget {
  setIdle(): void;
  setLoading(): void;
  setResult(summary: TLDRSummary, reviewsUsed: number, createdAt: number): void;
  setError(message: string, missingKey: boolean): void;
  open(): void;
  getAspects(): AspectId[];
}

export function createWidget(
  gameName: string,
  initialAspects: AspectId[],
  onGenerate: (force?: boolean) => void,
): TLDRWidget {
  const style = document.createElement("style");
  style.textContent = CSS;

  // Fixed tab on the right edge
  const tab = document.createElement("button");
  tab.className = "stldr-tab";
  tab.textContent = "TL;DR";
  tab.title = t("panelGenerate");

  // Side drawer
  const drawer = document.createElement("div");
  drawer.className = "stldr-drawer";

  const header = document.createElement("div");
  header.className = "stldr-header";
  const title = document.createElement("h3");
  title.className = "stldr-title";
  const ai = document.createElement("span");
  ai.className = "stldr-ai";
  ai.textContent = "TL;DR ";
  title.append(ai, document.createTextNode(t("panelTitle")));
  const actions = document.createElement("div");
  actions.className = "stldr-actions";
  const gear = document.createElement("button");
  gear.className = "stldr-gear";
  gear.textContent = "⚙";
  gear.title = t("panelOpenOptions");
  gear.addEventListener("click", openOptions);
  const closeBtn = document.createElement("button");
  closeBtn.className = "stldr-close";
  closeBtn.textContent = "✕";
  closeBtn.title = t("panelClose");
  closeBtn.addEventListener("click", () => drawer.classList.remove("stldr-open"));
  actions.append(gear, closeBtn);
  header.append(title, actions);

  const game = document.createElement("p");
  game.className = "stldr-game";
  game.textContent = gameName;

  // v0.4 — focus aspect chips ("filter for my playstyle"), always visible:
  // toggle what you care about, then Generate/Regenerate. Persisted globally.
  const selectedAspects = new Set<AspectId>(initialAspects);
  const chipsTitle = document.createElement("p");
  chipsTitle.className = "stldr-chips-title";
  chipsTitle.textContent = t("aspectsFocusTitle");
  const chips = document.createElement("div");
  chips.className = "stldr-chips";
  for (const aspect of ALL_ASPECTS) {
    const chip = document.createElement("button");
    chip.className = "stldr-chip" + (selectedAspects.has(aspect) ? " stldr-chip-on" : "");
    chip.textContent = t(ASPECT_LABEL_KEYS[aspect]);
    chip.addEventListener("click", () => {
      if (selectedAspects.has(aspect)) selectedAspects.delete(aspect);
      else selectedAspects.add(aspect);
      chip.classList.toggle("stldr-chip-on");
      void saveFocusAspects([...selectedAspects]);
    });
    chips.append(chip);
  }

  const body = document.createElement("div");

  drawer.append(header, game, chipsTitle, chips, body);
  document.body.append(style, tab, drawer);

  tab.addEventListener("click", () => drawer.classList.toggle("stldr-open"));

  function open(): void {
    drawer.classList.add("stldr-open");
  }

  function clear(): void {
    body.replaceChildren();
    actions.querySelector(".stldr-regenerate")?.remove();
  }

  function addRegenerate(): void {
    const btn = document.createElement("button");
    btn.className = "stldr-regenerate";
    btn.textContent = t("panelRegenerate");
    // Regenerate bypasses the cache (force)
    btn.addEventListener("click", () => onGenerate(true));
    actions.insertBefore(btn, gear);
  }

  function setIdle(): void {
    clear();
    const btn = document.createElement("button");
    btn.className = "stldr-generate";
    btn.textContent = t("panelGenerate");
    btn.addEventListener("click", () => onGenerate());
    const hint = document.createElement("p");
    hint.className = "stldr-hint";
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

  function setResult(summary: TLDRSummary, reviewsUsed: number, createdAt: number): void {
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

    // v0.3 — "current state": recent reviews vs the historical average
    if (summary.recent_trend) {
      const trend = TREND_STYLE[summary.recent_trend];
      const trendEl = document.createElement("div");
      trendEl.className = "stldr-trend";
      trendEl.style.color = trend.color;
      trendEl.textContent = `${trend.arrow} ${t(trend.labelKey)}`;
      sentimentEl.append(trendEl);
    }

    body.append(
      verdict,
      sentimentEl,
      buildList("stldr-pros", t("panelPros"), summary.pros),
      buildList("stldr-cons", t("panelCons"), summary.cons),
    );

    // v0.4 — one block per requested aspect, in chip order
    if (summary.aspects.length > 0) {
      const aspectsEl = document.createElement("div");
      aspectsEl.className = "stldr-aspects";
      const byId = new Map(summary.aspects.map((a) => [a.id, a]));
      for (const id of ALL_ASPECTS) {
        const aspect = byId.get(id);
        if (!aspect) continue;
        const row = document.createElement("div");
        row.className = "stldr-aspect";
        const dot = document.createElement("span");
        dot.className = "stldr-aspect-dot";
        dot.style.background = ASPECT_SENTIMENT_COLORS[aspect.sentiment];
        const label = document.createElement("b");
        label.textContent = t(ASPECT_LABEL_KEYS[id]) + ": ";
        row.append(dot, label, document.createTextNode(aspect.note));
        aspectsEl.append(row);
      }
      body.append(aspectsEl);
    }

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
    const when = new Date(createdAt).toLocaleString();
    footer.textContent =
      t("panelDisclosure", [String(reviewsUsed)]) + " " + t("panelGeneratedAt", [when]);
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
      const link = document.createElement("button");
      link.className = "stldr-options-link";
      link.textContent = t("panelOpenOptions");
      link.addEventListener("click", openOptions);
      body.append(link);
    } else {
      console.error("[steam-tldr]", message);
      addRegenerate();
    }
  }

  function getAspects(): AspectId[] {
    return ALL_ASPECTS.filter((a) => selectedAspects.has(a));
  }

  return { setIdle, setLoading, setResult, setError, open, getAspects };
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
