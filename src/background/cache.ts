// F6 — summary cache on chrome.storage.local.
// Key: summary:{appid}:{lang}:{profileId}:{model}:{selectionHash} — changing
// language, profile, model or selection configuration regenerates instead of
// serving a summary computed with different parameters.
import type {
  ReviewQuerySummary,
  ReviewSelectionConfig,
  TLDRSummary,
} from "../shared/types";

export interface CachedSummary {
  summary: TLDRSummary;
  reviewsUsed: number;
  poolSize: number;
  querySummary: ReviewQuerySummary;
  createdAt: number; // epoch ms
}

const PREFIX = "summary:";
const MAX_ENTRIES = 200; // chrome.storage.local ~10MB: LRU eviction beyond this

export function selectionHash(config: ReviewSelectionConfig): string {
  // stable stringify (sorted keys) + djb2
  const stable = JSON.stringify(config, Object.keys(flatten(config)).sort());
  let hash = 5381;
  for (let i = 0; i < stable.length; i++) {
    hash = ((hash << 5) + hash + stable.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function flatten(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (o: object): void => {
    for (const [k, v] of Object.entries(o)) {
      out[k] = v;
      if (v && typeof v === "object") walk(v);
    }
  };
  walk(obj);
  return out;
}

export function cacheKey(
  appid: string,
  lang: string,
  profileId: string,
  model: string,
  selHash: string,
  aspectsKey: string, // sorted aspect ids joined with "+", or "none"
): string {
  return `${PREFIX}${appid}:${lang}:${profileId}:${model}:${selHash}:${aspectsKey}`;
}

export async function getCached(key: string, ttlHours: number): Promise<CachedSummary | null> {
  if (ttlHours <= 0) return null; // cache disabled
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key] as CachedSummary | undefined;
  if (!entry) return null;
  if (Date.now() - entry.createdAt > ttlHours * 3_600_000) {
    await chrome.storage.local.remove(key);
    return null;
  }
  return entry;
}

export async function putCached(key: string, value: CachedSummary): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
  await evictIfNeeded();
}

async function evictIfNeeded(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const entries = Object.entries(all)
    .filter(([k]) => k.startsWith(PREFIX))
    .map(([k, v]) => ({ key: k, createdAt: (v as CachedSummary).createdAt ?? 0 }));
  if (entries.length <= MAX_ENTRIES) return;
  entries.sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = entries.slice(0, entries.length - MAX_ENTRIES).map((e) => e.key);
  await chrome.storage.local.remove(toRemove);
}
