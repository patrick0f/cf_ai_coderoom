import { describe, expect, test } from "vitest";
import { isNearBottom } from "./useAutoScroll";

describe("isNearBottom", () => {
  test("returns true when scrolled to bottom", () => {
    const result = isNearBottom({
      scrollTop: 500,
      scrollHeight: 600,
      clientHeight: 100,
    });
    expect(result).toBe(true);
  });

  test("returns true when within threshold of bottom", () => {
    const result = isNearBottom({
      scrollTop: 450,
      scrollHeight: 600,
      clientHeight: 100,
    });
    expect(result).toBe(true);
  });

  test("returns false when scrolled up beyond threshold", () => {
    const result = isNearBottom({
      scrollTop: 200,
      scrollHeight: 600,
      clientHeight: 100,
    });
    expect(result).toBe(false);
  });

  test("returns true for small content that fits in viewport", () => {
    const result = isNearBottom({
      scrollTop: 0,
      scrollHeight: 100,
      clientHeight: 200,
    });
    expect(result).toBe(true);
  });

  test("respects custom threshold", () => {
    const result = isNearBottom(
      {
        scrollTop: 300,
        scrollHeight: 600,
        clientHeight: 100,
      },
      250,
    );
    expect(result).toBe(true);
  });

  test("returns false when just outside custom threshold", () => {
    const result = isNearBottom(
      {
        scrollTop: 200,
        scrollHeight: 600,
        clientHeight: 100,
      },
      50,
    );
    expect(result).toBe(false);
  });
});
