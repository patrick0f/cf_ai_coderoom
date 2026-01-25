import { describe, test, expect } from "vitest";
import {
  buildSummaryMessages,
  buildTodoExtractMessages,
  parseTodosFromResponse,
} from "./summary-logic";
import type { Message } from "./types";

const createMessage = (
  seq: number,
  role: "user" | "assistant",
  content: string,
): Message => ({
  seq,
  role,
  content,
  ts: Date.now(),
});

describe("buildSummaryMessages", () => {
  const summaryPrompt = "Summarize the conversation.";

  test("builds messages with current summary and conversation", () => {
    const currentSummary = "User is debugging a login issue.";
    const messages: Message[] = [
      createMessage(1, "user", "The login fails with error 401"),
      createMessage(2, "assistant", "Check the token expiration"),
    ];

    const result = buildSummaryMessages(
      summaryPrompt,
      currentSummary,
      messages,
    );

    expect(result).toEqual([
      {
        role: "system",
        content: summaryPrompt,
      },
      {
        role: "user",
        content: `Current summary:\n${currentSummary}\n\nRecent messages:\nUSER: The login fails with error 401\nASSISTANT: Check the token expiration\n\nOutput only the updated summary.`,
      },
    ]);
  });

  test("handles empty current summary", () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];

    const result = buildSummaryMessages(summaryPrompt, "", messages);

    expect(result).toEqual([
      {
        role: "system",
        content: summaryPrompt,
      },
      {
        role: "user",
        content: `Current summary:\n(none)\n\nRecent messages:\nUSER: Hello\n\nOutput only the updated summary.`,
      },
    ]);
  });

  test("handles empty messages array", () => {
    const currentSummary = "Previous context.";

    const result = buildSummaryMessages(summaryPrompt, currentSummary, []);

    expect(result).toEqual([
      {
        role: "system",
        content: summaryPrompt,
      },
      {
        role: "user",
        content: `Current summary:\n${currentSummary}\n\nRecent messages:\n(none)\n\nOutput only the updated summary.`,
      },
    ]);
  });
});

describe("buildTodoExtractMessages", () => {
  const todoPrompt = "Extract TODOs from the conversation.";

  test("builds messages with conversation for TODO extraction", () => {
    const messages: Message[] = [
      createMessage(1, "user", "TODO: fix the null check"),
      createMessage(2, "assistant", "I suggest also adding tests"),
    ];

    const result = buildTodoExtractMessages(todoPrompt, messages);

    expect(result).toEqual([
      {
        role: "system",
        content: todoPrompt,
      },
      {
        role: "user",
        content: `Conversation:\nUSER: TODO: fix the null check\nASSISTANT: I suggest also adding tests\n\nOutput only a valid JSON array of strings.`,
      },
    ]);
  });

  test("handles empty messages array", () => {
    const result = buildTodoExtractMessages(todoPrompt, []);

    expect(result).toEqual([
      {
        role: "system",
        content: todoPrompt,
      },
      {
        role: "user",
        content: `Conversation:\n(none)\n\nOutput only a valid JSON array of strings.`,
      },
    ]);
  });
});

describe("parseTodosFromResponse", () => {
  test("parses valid JSON array", () => {
    const response = '["Fix the null check", "Add tests"]';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["Fix the null check", "Add tests"]);
  });

  test("handles empty array", () => {
    const response = "[]";

    const result = parseTodosFromResponse(response);

    expect(result).toEqual([]);
  });

  test("extracts JSON from markdown code block", () => {
    const response = '```json\n["Item 1", "Item 2"]\n```';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["Item 1", "Item 2"]);
  });

  test("extracts JSON from plain code block", () => {
    const response = '```\n["Item 1"]\n```';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["Item 1"]);
  });

  test("returns empty array for invalid JSON", () => {
    const response = "not valid json";

    const result = parseTodosFromResponse(response);

    expect(result).toEqual([]);
  });

  test("returns empty array for non-array JSON", () => {
    const response = '{"key": "value"}';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual([]);
  });

  test("filters out non-string items", () => {
    const response = '["valid", 123, "also valid", null]';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["valid", "also valid"]);
  });

  test("limits to 10 items", () => {
    const items = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}`);
    const response = JSON.stringify(items);

    const result = parseTodosFromResponse(response);

    expect(result).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
      "Item 6",
      "Item 7",
      "Item 8",
      "Item 9",
      "Item 10",
    ]);
  });

  test("handles response with surrounding text", () => {
    const response =
      'Here are the TODOs: ["Fix bug", "Add tests"] Hope this helps!';

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["Fix bug", "Add tests"]);
  });

  test("returns empty array for non-string non-array input", () => {
    expect(parseTodosFromResponse(null)).toEqual([]);
    expect(parseTodosFromResponse(undefined)).toEqual([]);
    expect(parseTodosFromResponse(123)).toEqual([]);
    expect(parseTodosFromResponse({ key: "value" })).toEqual([]);
  });

  test("handles array input directly (model returns parsed array)", () => {
    const response = ["Fix the bug", "Add tests", "Update docs"];

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["Fix the bug", "Add tests", "Update docs"]);
  });

  test("filters non-strings from array input", () => {
    const response = ["valid", 123, "also valid", null, { obj: true }];

    const result = parseTodosFromResponse(response);

    expect(result).toEqual(["valid", "also valid"]);
  });

  test("limits array input to 10 items", () => {
    const response = Array.from({ length: 15 }, (_, i) => `Item ${i + 1}`);

    const result = parseTodosFromResponse(response);

    expect(result).toEqual([
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
      "Item 5",
      "Item 6",
      "Item 7",
      "Item 8",
      "Item 9",
      "Item 10",
    ]);
  });
});
