import type { RateLimitConfig, RateLimitEntry } from "./types";

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  message: { maxRequests: 10, windowMs: 60_000 },
  review: { maxRequests: 5, windowMs: 60_000 },
};

export type RateLimitResult = {
  allowed: boolean;
  retryAfter?: number;
  updated: RateLimitEntry;
};

export function checkRateLimit(
  rateLimits: Record<string, RateLimitEntry>,
  key: string,
  config: RateLimitConfig,
  now: number,
): RateLimitResult {
  const entry = rateLimits[key];

  if (!entry || now > entry.resetAt) {
    return {
      allowed: true,
      updated: { count: 1, resetAt: now + config.windowMs },
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      updated: entry,
    };
  }

  return {
    allowed: true,
    updated: { count: entry.count + 1, resetAt: entry.resetAt },
  };
}
