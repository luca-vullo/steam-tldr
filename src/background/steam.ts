import type { ReviewQuerySummary, SteamReview } from "../shared/types";

interface RawReview {
  recommendationid: string;
  review: string;
  voted_up: boolean;
  votes_up: number;
  weighted_vote_score: number | string;
  timestamp_created: number;
  language: string;
  author: { playtime_forever: number };
}

interface RawResponse {
  success: number;
  query_summary: {
    review_score_desc: string;
    total_positive: number;
    total_negative: number;
    total_reviews: number;
  };
  reviews: RawReview[];
}

export interface FetchReviewsParams {
  filter: "recent" | "all";
  dayRange?: number; // solo con filter=all
  numPerPage?: number; // max 100
}

export async function fetchSteamReviews(
  appid: string,
  params: FetchReviewsParams,
): Promise<{ reviews: SteamReview[]; querySummary: ReviewQuerySummary }> {
  const query = new URLSearchParams({
    json: "1",
    filter: params.filter,
    language: "all", // input multilingue: la lingua (F8) governa solo l'output
    num_per_page: String(params.numPerPage ?? 100),
    purchase_type: "all",
  });
  if (params.filter === "all" && params.dayRange) {
    query.set("day_range", String(params.dayRange));
  }

  const url = `https://store.steampowered.com/appreviews/${appid}?${query}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Steam appreviews HTTP ${response.status}`);
  }
  const data = (await response.json()) as RawResponse;
  if (data.success !== 1) {
    throw new Error("Steam appreviews: success != 1");
  }

  return {
    reviews: data.reviews.map(normalizeReview),
    querySummary: {
      reviewScoreDesc: data.query_summary.review_score_desc,
      totalPositive: data.query_summary.total_positive,
      totalNegative: data.query_summary.total_negative,
      totalReviews: data.query_summary.total_reviews,
    },
  };
}

function normalizeReview(raw: RawReview): SteamReview {
  // weighted_vote_score: stringa con filter=all, numero con filter=recent
  const score = Number(raw.weighted_vote_score);
  return {
    id: raw.recommendationid,
    text: raw.review.trim(),
    votedUp: raw.voted_up,
    votesUp: raw.votes_up,
    weightedVoteScore: Number.isFinite(score) ? score : 0.5,
    playtimeForeverMin: raw.author.playtime_forever,
    timestampCreated: raw.timestamp_created,
    language: raw.language,
  };
}
