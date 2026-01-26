import { describe, expect, test } from "vitest";
import { checkRateLimit, RATE_LIMITS } from "./rate-limit";
import type { RateLimitEntry } from "./types";

describe("checkRateLimit", () => {
  const config = { maxRequests: 3, windowMs: 60_000 };
  const now = 1000000;

  test("first request allowed, returns new entry", () => {
    const rateLimits: Record<string, RateLimitEntry> = {};
    const result = checkRateLimit(rateLimits, "client1:message", config, now);

    expect(result).toEqual({
      allowed: true,
      updated: { count: 1, resetAt: now + config.windowMs },
    });
  });

  test("requests within limit allowed, increments count", () => {
    const rateLimits: Record<string, RateLimitEntry> = {
      "client1:message": { count: 2, resetAt: now + 30_000 },
    };
    const result = checkRateLimit(rateLimits, "client1:message", config, now);

    expect(result).toEqual({
      allowed: true,
      updated: { count: 3, resetAt: now + 30_000 },
    });
  });

  test("request exceeding limit rejected with retryAfter", () => {
    const rateLimits: Record<string, RateLimitEntry> = {
      "client1:message": { count: 3, resetAt: now + 30_000 },
    };
    const result = checkRateLimit(rateLimits, "client1:message", config, now);

    expect(result).toEqual({
      allowed: false,
      retryAfter: 30,
      updated: { count: 3, resetAt: now + 30_000 },
    });
  });

  test("window reset after expiry", () => {
    const rateLimits: Record<string, RateLimitEntry> = {
      "client1:message": { count: 3, resetAt: now - 1 },
    };
    const result = checkRateLimit(rateLimits, "client1:message", config, now);

    expect(result).toEqual({
      allowed: true,
      updated: { count: 1, resetAt: now + config.windowMs },
    });
  });

  test("different keys are tracked independently", () => {
    const rateLimits: Record<string, RateLimitEntry> = {
      "client1:message": { count: 3, resetAt: now + 30_000 },
    };
    const result = checkRateLimit(rateLimits, "client1:review", config, now);

    expect(result).toEqual({
      allowed: true,
      updated: { count: 1, resetAt: now + config.windowMs },
    });
  });
});

describe("RATE_LIMITS", () => {
  test("message limit is 10 per minute", () => {
    expect(RATE_LIMITS.message).toEqual({ maxRequests: 10, windowMs: 60_000 });
  });

  test("review limit is 5 per minute", () => {
    expect(RATE_LIMITS.review).toEqual({ maxRequests: 5, windowMs: 60_000 });
  });
});
