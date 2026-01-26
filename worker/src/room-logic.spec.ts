import { describe, test, expect } from "vitest";
import {
  boundMessages,
  createRoomData,
  createMessage,
  validateMessageContent,
} from "./room-logic";
import type { Message } from "./types";
import { LIMITS } from "./types";

describe("boundMessages", () => {
  test("returns empty array when given empty array", () => {
    expect(boundMessages([], 30)).toEqual([]);
  });

  test("returns all messages when under limit", () => {
    const messages: Message[] = [
      { seq: 1, role: "user", content: "hello", ts: 1000 },
      { seq: 2, role: "assistant", content: "hi", ts: 1001 },
    ];
    expect(boundMessages(messages, 30)).toEqual(messages);
  });

  test("keeps only last N messages when over limit", () => {
    const messages: Message[] = Array.from({ length: 5 }, (_, i) => ({
      seq: i + 1,
      role: "user" as const,
      content: `msg ${i + 1}`,
      ts: 1000 + i,
    }));
    const result = boundMessages(messages, 3);
    expect(result).toEqual([
      { seq: 3, role: "user", content: "msg 3", ts: 1002 },
      { seq: 4, role: "user", content: "msg 4", ts: 1003 },
      { seq: 5, role: "user", content: "msg 5", ts: 1004 },
    ]);
  });

  test("handles exactly at limit", () => {
    const messages: Message[] = Array.from({ length: 3 }, (_, i) => ({
      seq: i + 1,
      role: "user" as const,
      content: `msg ${i + 1}`,
      ts: 1000 + i,
    }));
    expect(boundMessages(messages, 3)).toEqual(messages);
  });
});

describe("createRoomData", () => {
  test("creates room with correct defaults", () => {
    const roomId = "test-room-123";
    const clientId = "client-abc";
    const result = createRoomData(roomId, clientId);

    expect(result).toEqual({
      roomId: "test-room-123",
      createdAt: expect.any(Number),
      ownerClientId: "client-abc",
      messages: [],
      rollingSummary: "",
      pinnedPreferences: "",
      artifacts: {
        lastReview: null,
        todos: null,
        notes: "",
      },
      rateLimits: {},
    });
  });

  test("sets createdAt to current timestamp", () => {
    const before = Date.now();
    const result = createRoomData("room", "client");
    const after = Date.now();

    expect(result.createdAt).toBeGreaterThanOrEqual(before);
    expect(result.createdAt).toBeLessThanOrEqual(after);
  });
});

describe("createMessage", () => {
  test("creates message with seq 1 when no existing messages", () => {
    const result = createMessage("hello", "user", [], "client-123");

    expect(result).toEqual({
      seq: 1,
      role: "user",
      content: "hello",
      ts: expect.any(Number),
      clientId: "client-123",
    });
  });

  test("increments seq based on last message", () => {
    const existing: Message[] = [
      { seq: 1, role: "user", content: "a", ts: 1000 },
      { seq: 2, role: "assistant", content: "b", ts: 1001 },
      { seq: 3, role: "user", content: "c", ts: 1002 },
    ];
    const result = createMessage("new", "user", existing, "client");

    expect(result.seq).toBe(4);
  });

  test("creates assistant message without clientId", () => {
    const result = createMessage("response", "assistant", []);

    expect(result).toEqual({
      seq: 1,
      role: "assistant",
      content: "response",
      ts: expect.any(Number),
    });
    expect(result.clientId).toBeUndefined();
  });

  test("sets ts to current timestamp", () => {
    const before = Date.now();
    const result = createMessage("test", "user", []);
    const after = Date.now();

    expect(result.ts).toBeGreaterThanOrEqual(before);
    expect(result.ts).toBeLessThanOrEqual(after);
  });
});

describe("validateMessageContent", () => {
  test("returns valid for normal content", () => {
    expect(validateMessageContent("Hello, world!")).toEqual({ valid: true });
  });

  test("returns invalid for empty string", () => {
    expect(validateMessageContent("")).toEqual({
      valid: false,
      error: "Message content cannot be empty",
      code: "EMPTY_CONTENT",
    });
  });

  test("returns invalid for whitespace-only string", () => {
    expect(validateMessageContent("   \n\t  ")).toEqual({
      valid: false,
      error: "Message content cannot be empty",
      code: "EMPTY_CONTENT",
    });
  });

  test("returns invalid for content over limit", () => {
    const longContent = "a".repeat(LIMITS.maxCharsPerMessage + 1);
    expect(validateMessageContent(longContent)).toEqual({
      valid: false,
      error: `Message exceeds maximum length of ${LIMITS.maxCharsPerMessage} characters`,
      code: "CONTENT_TOO_LONG",
    });
  });

  test("returns valid for content exactly at limit", () => {
    const exactContent = "a".repeat(LIMITS.maxCharsPerMessage);
    expect(validateMessageContent(exactContent)).toEqual({ valid: true });
  });
});
