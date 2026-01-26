import { describe, test, expect } from "vitest";
import {
  computeInputHash,
  buildReviewMessages,
  parseReviewResponse,
} from "./review-logic";
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

describe("computeInputHash", () => {
  test("returns deterministic hash for same input", async () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];
    const summary = "Test summary";

    const hash1 = await computeInputHash(messages, summary);
    const hash2 = await computeInputHash(messages, summary);

    expect(hash1).toBe(hash2);
  });

  test("returns different hash for different messages", async () => {
    const messages1: Message[] = [createMessage(1, "user", "Hello")];
    const messages2: Message[] = [createMessage(1, "user", "Goodbye")];
    const summary = "Test summary";

    const hash1 = await computeInputHash(messages1, summary);
    const hash2 = await computeInputHash(messages2, summary);

    expect(hash1).not.toBe(hash2);
  });

  test("returns different hash for different summary", async () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];

    const hash1 = await computeInputHash(messages, "Summary A");
    const hash2 = await computeInputHash(messages, "Summary B");

    expect(hash1).not.toBe(hash2);
  });

  test("handles empty messages array", async () => {
    const hash = await computeInputHash([], "Some summary");

    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("handles empty summary", async () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];
    const hash = await computeInputHash(messages, "");

    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  test("returns hex string", async () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];
    const hash = await computeInputHash(messages, "summary");

    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("buildReviewMessages", () => {
  const reviewPrompt = "You are a code reviewer.";

  test("builds messages with review prompt and conversation", () => {
    const messages: Message[] = [
      createMessage(
        1,
        "user",
        "Review this code: function add(a,b){return a+b}",
      ),
      createMessage(
        2,
        "assistant",
        "The code looks simple but lacks type checking",
      ),
    ];
    const summary = "Discussing an add function";

    const result = buildReviewMessages(reviewPrompt, messages, summary);

    expect(result).toEqual([
      {
        role: "system",
        content: reviewPrompt,
      },
      {
        role: "user",
        content: `Context summary:\n${summary}\n\nConversation:\nUSER: Review this code: function add(a,b){return a+b}\nASSISTANT: The code looks simple but lacks type checking\n\nProvide your review as JSON.`,
      },
    ]);
  });

  test("handles empty summary", () => {
    const messages: Message[] = [createMessage(1, "user", "Hello")];

    const result = buildReviewMessages(reviewPrompt, messages, "");

    expect(result[1].content).toContain("Context summary:\n(none)");
  });

  test("handles empty messages array", () => {
    const result = buildReviewMessages(reviewPrompt, [], "Some context");

    expect(result[1].content).toContain("Conversation:\n(none)");
  });
});

describe("parseReviewResponse", () => {
  test("parses valid JSON response", () => {
    const response = JSON.stringify({
      summary: "Code has issues",
      issues: [
        {
          severity: "major",
          title: "Bug",
          description: "Found a bug",
          location: "main.ts",
        },
      ],
      edgeCases: ["Empty input"],
      refactorSuggestions: [
        {
          title: "Extract function",
          rationale: "Improves readability",
          effort: "low",
        },
      ],
      testPlan: ["Test edge cases"],
    });

    const result = parseReviewResponse(response);

    expect(result).toEqual({
      summary: "Code has issues",
      issues: [
        {
          severity: "major",
          title: "Bug",
          description: "Found a bug",
          location: "main.ts",
        },
      ],
      edgeCases: ["Empty input"],
      refactorSuggestions: [
        {
          title: "Extract function",
          rationale: "Improves readability",
          effort: "low",
        },
      ],
      testPlan: ["Test edge cases"],
    });
  });

  test("extracts JSON from markdown code block", () => {
    const response = `Here's my review:
\`\`\`json
{
  "summary": "Looks good",
  "issues": [],
  "edgeCases": [],
  "refactorSuggestions": [],
  "testPlan": []
}
\`\`\`
Hope this helps!`;

    const result = parseReviewResponse(response);

    expect(result.summary).toBe("Looks good");
    expect(result.issues).toEqual([]);
  });

  test("extracts JSON from plain code block", () => {
    const response = `\`\`\`
{"summary": "Test", "issues": [], "edgeCases": [], "refactorSuggestions": [], "testPlan": []}
\`\`\``;

    const result = parseReviewResponse(response);

    expect(result.summary).toBe("Test");
  });

  test("returns fallback for invalid JSON", () => {
    const response = "This is not valid JSON at all";

    const result = parseReviewResponse(response);

    expect(result.summary).toBe("This is not valid JSON at all");
    expect(result.issues).toEqual([]);
    expect(result.edgeCases).toEqual([]);
    expect(result.refactorSuggestions).toEqual([]);
    expect(result.testPlan).toEqual([]);
  });

  test("returns fallback for non-string input", () => {
    expect(parseReviewResponse(null).summary).toBe("Invalid response");
    expect(parseReviewResponse(undefined).summary).toBe("Invalid response");
    expect(parseReviewResponse(123).summary).toBe("Invalid response");
  });

  test("handles partial JSON with missing fields", () => {
    const response = JSON.stringify({
      summary: "Partial review",
    });

    const result = parseReviewResponse(response);

    expect(result.summary).toBe("Partial review");
    expect(result.issues).toEqual([]);
    expect(result.edgeCases).toEqual([]);
    expect(result.refactorSuggestions).toEqual([]);
    expect(result.testPlan).toEqual([]);
  });

  test("limits arrays to 5 items each", () => {
    const response = JSON.stringify({
      summary: "Many issues",
      issues: Array.from({ length: 10 }, (_, i) => ({
        severity: "minor",
        title: `Issue ${i}`,
        description: "desc",
        location: "loc",
      })),
      edgeCases: Array.from({ length: 10 }, (_, i) => `Edge ${i}`),
      refactorSuggestions: Array.from({ length: 10 }, (_, i) => ({
        title: `Refactor ${i}`,
        rationale: "reason",
        effort: "low",
      })),
      testPlan: Array.from({ length: 10 }, (_, i) => `Test ${i}`),
    });

    const result = parseReviewResponse(response);

    expect(result.issues).toHaveLength(5);
    expect(result.edgeCases).toHaveLength(5);
    expect(result.refactorSuggestions).toHaveLength(5);
    expect(result.testPlan).toHaveLength(5);
  });

  test("filters invalid issues", () => {
    const response = JSON.stringify({
      summary: "Review",
      issues: [
        {
          severity: "major",
          title: "Valid",
          description: "desc",
          location: "loc",
        },
        { severity: "invalid", title: "Invalid severity" },
        "not an object",
        null,
      ],
      edgeCases: [],
      refactorSuggestions: [],
      testPlan: [],
    });

    const result = parseReviewResponse(response);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].title).toBe("Valid");
  });

  test("filters invalid refactor suggestions", () => {
    const response = JSON.stringify({
      summary: "Review",
      issues: [],
      edgeCases: [],
      refactorSuggestions: [
        { title: "Valid", rationale: "reason", effort: "low" },
        { title: "Invalid effort", rationale: "reason", effort: "invalid" },
        "not an object",
      ],
      testPlan: [],
    });

    const result = parseReviewResponse(response);

    expect(result.refactorSuggestions).toHaveLength(1);
    expect(result.refactorSuggestions[0].title).toBe("Valid");
  });

  test("handles truncated JSON by extracting what is parseable", () => {
    const truncated =
      '{\n  "summary": "The code has issues with validation",\n  "issues": [\n    {\n      "severity": "major",\n      "title": "Missing input validation",\n      "description": "No validation on user input",\n      "location": "handler.ts"\n    }\n  ],\n  "edgeCases": ["Empty string input"],\n  "refactorSuggestions": [\n    {\n      "title": "Add validation';

    const result = parseReviewResponse(truncated);

    expect(result.summary).toBe("The code has issues with validation");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].title).toBe("Missing input validation");
    expect(result.edgeCases).toEqual(["Empty string input"]);
  });

  test("extracts summary from truncated JSON with only summary complete", () => {
    const truncated =
      '{"summary": "Good code overall", "issues": [{"severity": "minor", "tit';

    const result = parseReviewResponse(truncated);

    expect(result.summary).toBe("Good code overall");
  });
});
