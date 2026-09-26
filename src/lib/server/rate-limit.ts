import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { AppError } from "@/lib/errors";
import { describeWait } from "@/lib/format";

// The Vercel Marketplace integration may expose either naming scheme.
const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const limiter = (prefix: string, tokens: number, window: Parameters<typeof Ratelimit.slidingWindow>[1]) =>
  redis
    ? new Ratelimit({ redis, prefix: `curator:${prefix}`, limiter: Ratelimit.slidingWindow(tokens, window) })
    : null;

/**
 * Budgets per bucket. Curation is the only expensive call (one Claude request), so it gets
 * a tight per-caller limit plus a global daily ceiling as a cost backstop.
 */
const LIMITS = {
  curatePublic: limiter("curate:public", Number(process.env.CURATE_LIMIT_PUBLIC ?? 3), "1 d"),
  curateSpotify: limiter("curate:spotify", Number(process.env.CURATE_LIMIT_SPOTIFY ?? 20), "1 d"),
  curateGlobal: limiter("curate:global", Number(process.env.CURATE_LIMIT_GLOBAL ?? 300), "1 d"),
  enrich: limiter("enrich", 30, "1 h"),
  library: limiter("library", 30, "1 h"),
  preview: limiter("preview", 600, "1 h"),
} as const;

export type LimitBucket = keyof typeof LIMITS;

const isProduction = process.env.VERCEL_ENV === "production";

/**
 * Consumes one token from `bucket` for `key`, throwing RATE_LIMITED when exhausted.
 * Without Redis, limits are skipped in development; in production, unlimited public
 * access would be an open cost hole, so `failClosed` buckets refuse instead.
 */
export async function enforceLimit(bucket: LimitBucket, key: string, { failClosed = false } = {}) {
  const rl = LIMITS[bucket];
  if (!rl) {
    if (failClosed && isProduction) {
      throw new AppError("CURATION_DISABLED", "Public curation is temporarily unavailable.", 503);
    }
    return;
  }
  const { success, reset } = await rl.limit(key);
  if (!success) {
    const message =
      bucket === "curateGlobal"
        ? "The curator has hit its daily limit. Try again tomorrow."
        : `You've hit the limit for now. Try again ${describeWait((reset - Date.now()) / 1000)}.`;
    throw new AppError("RATE_LIMITED", message, 429);
  }
}

/** Kill switch for the Claude-backed step, e.g. if costs spike. */
export function assertCurationEnabled() {
  if (process.env.CURATION_ENABLED === "false") {
    throw new AppError("CURATION_DISABLED", "Curation is paused right now. Check back soon.", 503);
  }
}
