import type {
  ReviewQuerySummary,
  ReviewSelectionConfig,
  SteamReview,
} from "../shared/types";
import { fetchSteamReviews } from "./steam";

export interface SelectionResult {
  selected: SteamReview[];
  querySummary: ReviewQuerySummary;
  poolSize: number;
}

// Threshold below which steam_native falls back to filter=recent
const NATIVE_FALLBACK_MIN = 10;

export async function collectReviews(
  appid: string,
  config: ReviewSelectionConfig,
): Promise<SelectionResult> {
  switch (config.mode) {
    case "hybrid": {
      const [helpful, recent] = await Promise.all([
        fetchSteamReviews(appid, { filter: "all", dayRange: config.dayRange }),
        fetchSteamReviews(appid, { filter: "recent" }),
      ]);
      const pool = dedupe([...helpful.reviews, ...recent.reviews]).filter(
        (r) => r.text.length >= config.minChars,
      );
      return {
        selected: selectScored(pool, config),
        querySummary: recent.querySummary,
        poolSize: pool.length,
      };
    }
    case "recent_scored": {
      const { reviews, querySummary } = await fetchSteamReviews(appid, {
        filter: "recent",
      });
      const pool = reviews.filter((r) => r.text.length >= config.minChars);
      return { selected: selectScored(pool, config), querySummary, poolSize: pool.length };
    }
    case "steam_native": {
      let { reviews, querySummary } = await fetchSteamReviews(appid, {
        filter: "all",
        dayRange: config.dayRange,
      });
      if (reviews.length < NATIVE_FALLBACK_MIN) {
        ({ reviews, querySummary } = await fetchSteamReviews(appid, {
          filter: "recent",
        }));
      }
      const pool = reviews.filter((r) => r.text.length >= config.minChars);
      // Steam's own ordering, no client-side scoring
      return {
        selected: pool.slice(0, config.numReviews),
        querySummary,
        poolSize: pool.length,
      };
    }
  }
}

function dedupe(reviews: SteamReview[]): SteamReview[] {
  const seen = new Map<string, SteamReview>();
  for (const r of reviews) {
    if (!seen.has(r.id)) seen.set(r.id, r);
  }
  return [...seen.values()];
}

// Weighted scoring + selection that preserves the pool's real positive/negative ratio
function selectScored(
  pool: SteamReview[],
  config: ReviewSelectionConfig,
): SteamReview[] {
  if (pool.length <= config.numReviews) {
    return [...pool].sort((a, b) => b.timestampCreated - a.timestampCreated);
  }

  const nowSec = Date.now() / 1000;
  const maxPlaytime = Math.max(...pool.map((r) => r.playtimeForeverMin), 1);
  const scored = pool
    .map((r) => ({ review: r, score: scoreReview(r, config, nowSec, maxPlaytime) }))
    .sort((a, b) => b.score - a.score);

  const positives = scored.filter((s) => s.review.votedUp);
  const negatives = scored.filter((s) => !s.review.votedUp);
  const positiveRatio = positives.length / pool.length;
  let targetPositives = Math.round(config.numReviews * positiveRatio);
  targetPositives = Math.min(
    Math.max(targetPositives, config.numReviews - negatives.length),
    positives.length,
  );

  return [
    ...positives.slice(0, targetPositives),
    ...negatives.slice(0, config.numReviews - targetPositives),
  ].map((s) => s.review);
}

function scoreReview(
  r: SteamReview,
  config: ReviewSelectionConfig,
  nowSec: number,
  maxPlaytime: number,
): number {
  const w = config.weights;

  const playtime =
    Math.log1p(r.playtimeForeverMin) / Math.log1p(maxPlaytime);
  const substance = Math.min(1, r.text.length / 1000);
  const ageDays = Math.max(0, (nowSec - r.timestampCreated) / 86400);
  const freshness = Math.max(0, 1 - ageDays / config.dayRange);
  // Without votes, weighted_vote_score is the neutral 0.5 default: no real
  // helpfulness signal, so its weight is redistributed to the other components.
  const helpfulness = r.votesUp > 0 ? clamp01(r.weightedVoteScore) : null;

  let score =
    w.playtime * playtime + w.substance * substance + w.freshness * freshness;
  let weightSum = w.playtime + w.substance + w.freshness;
  if (helpfulness !== null) {
    score += w.helpfulness * helpfulness;
    weightSum += w.helpfulness;
  }
  return weightSum > 0 ? score / weightSum : 0;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
