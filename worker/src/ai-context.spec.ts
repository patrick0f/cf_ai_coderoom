import { describe, test, expect } from "vitest";
import { buildChatMessages } from "./ai-context";
import type { Message } from "./types";

describe("buildChatMessages", () => {
  const systemPrompt = "You are a helpful assistant.";

  test("returns system message as first element", () => {
    const result = buildChatMessages(systemPrompt, "", [], 4000);

    expect(result[0]).toEqual({
      role: "system",
      content: systemPrompt,
    });
  });

  test("includes rolling summary in system context when present", () => {
    const summary = "Previous context: User is working on a React app.";
    const result = buildChatMessages(systemPrompt, summary, [], 4000);

    expect(result[0]).toEqual({
      role: "system",
      content: `${systemPrompt}\n\nContext from previous conversation:\n${summary}`,
    });
  });

  test("does not modify system prompt when summary is empty", () => {
    const result = buildChatMessages(systemPrompt, "", [], 4000);

    expect(result[0].content).toBe(systemPrompt);
  });

  test("includes messages from history in order", () => {
    const messages: Message[] = [
      { seq: 1, role: "user", content: "Hello", ts: 1000 },
      { seq: 2, role: "assistant", content: "Hi there!", ts: 1001 },
      { seq: 3, role: "user", content: "Help me", ts: 1002 },
    ];
    const result = buildChatMessages(systemPrompt, "", messages, 4000);

    expect(result).toHaveLength(4);
    expect(result[1]).toEqual({ role: "user", content: "Hello" });
    expect(result[2]).toEqual({ role: "assistant", content: "Hi there!" });
    expect(result[3]).toEqual({ role: "user", content: "Help me" });
  });

  test("handles empty message history", () => {
    const result = buildChatMessages(systemPrompt, "", [], 4000);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("system");
  });

  test("truncates oldest messages when over maxChars limit", () => {
    const messages: Message[] = [
      { seq: 1, role: "user", content: "a".repeat(100), ts: 1000 },
      { seq: 2, role: "assistant", content: "b".repeat(100), ts: 1001 },
      { seq: 3, role: "user", content: "c".repeat(100), ts: 1002 },
      { seq: 4, role: "assistant", content: "d".repeat(100), ts: 1003 },
    ];
    const result = buildChatMessages(systemPrompt, "", messages, 300);

    expect(result.length).toBeLessThan(5);
    expect(result[result.length - 1].content).toBe("d".repeat(100));
  });

  test("always keeps system message even if over limit", () => {
    const longPrompt = "x".repeat(500);
    const result = buildChatMessages(longPrompt, "", [], 100);

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("system");
  });

  test("keeps most recent messages when truncating", () => {
    const messages: Message[] = [
      { seq: 1, role: "user", content: "old message", ts: 1000 },
      { seq: 2, role: "assistant", content: "old reply", ts: 1001 },
      { seq: 3, role: "user", content: "new message", ts: 1002 },
      { seq: 4, role: "assistant", content: "new reply", ts: 1003 },
    ];
    const shortLimit = systemPrompt.length + 25;
    const result = buildChatMessages(systemPrompt, "", messages, shortLimit);

    const contents = result.map((m) => m.content);
    expect(contents).toContain("new reply");
    expect(contents).not.toContain("old message");
  });
});
