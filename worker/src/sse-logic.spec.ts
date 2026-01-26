import { describe, expect, test } from "vitest";
import {
  formatSSEEvent,
  parseAIStreamChunk,
  createSSEHeaders,
} from "./sse-logic";
import type { SSEEvent } from "./sse-types";

describe("formatSSEEvent", () => {
  test("formats meta event", () => {
    const event: SSEEvent = { type: "meta", seq: 5 };
    expect(formatSSEEvent(event)).toBe('data: {"type":"meta","seq":5}\n\n');
  });

  test("formats delta event", () => {
    const event: SSEEvent = { type: "delta", content: "Hello" };
    expect(formatSSEEvent(event)).toBe(
      'data: {"type":"delta","content":"Hello"}\n\n',
    );
  });

  test("formats done event", () => {
    const event: SSEEvent = { type: "done", totalChars: 100 };
    expect(formatSSEEvent(event)).toBe(
      'data: {"type":"done","totalChars":100}\n\n',
    );
  });

  test("formats error event without partial", () => {
    const event: SSEEvent = {
      type: "error",
      code: "AI_ERROR",
      message: "Model failed",
    };
    expect(formatSSEEvent(event)).toBe(
      'data: {"type":"error","code":"AI_ERROR","message":"Model failed"}\n\n',
    );
  });

  test("formats error event with partial content", () => {
    const event: SSEEvent = {
      type: "error",
      code: "AI_ERROR",
      message: "Timeout",
      partial: "Partial response",
    };
    expect(formatSSEEvent(event)).toBe(
      'data: {"type":"error","code":"AI_ERROR","message":"Timeout","partial":"Partial response"}\n\n',
    );
  });

  test("escapes special characters in content", () => {
    const event: SSEEvent = {
      type: "delta",
      content: 'Line1\nLine2\t"quoted"',
    };
    const result = formatSSEEvent(event);
    expect(result).toBe(
      'data: {"type":"delta","content":"Line1\\nLine2\\t\\"quoted\\""}\n\n',
    );
  });
});

describe("parseAIStreamChunk", () => {
  test("extracts token from valid JSON line", () => {
    const line = '{"response":"Hello"}';
    expect(parseAIStreamChunk(line)).toBe("Hello");
  });

  test("extracts token with special characters", () => {
    const line = '{"response":"function() {\\n  return 42;\\n}"}';
    expect(parseAIStreamChunk(line)).toBe("function() {\n  return 42;\n}");
  });

  test("returns null for empty line", () => {
    expect(parseAIStreamChunk("")).toBe(null);
  });

  test("returns null for whitespace-only line", () => {
    expect(parseAIStreamChunk("   ")).toBe(null);
    expect(parseAIStreamChunk("\t\n")).toBe(null);
  });

  test("returns null for invalid JSON", () => {
    expect(parseAIStreamChunk("{not valid json}")).toBe(null);
  });

  test("returns null for JSON without response field", () => {
    expect(parseAIStreamChunk('{"other":"field"}')).toBe(null);
  });

  test("returns null for JSON with null response", () => {
    expect(parseAIStreamChunk('{"response":null}')).toBe(null);
  });

  test("handles empty response string", () => {
    expect(parseAIStreamChunk('{"response":""}')).toBe("");
  });

  test("handles data: prefix from SSE format", () => {
    expect(parseAIStreamChunk('data: {"response":"token"}')).toBe("token");
  });

  test("handles [DONE] marker", () => {
    expect(parseAIStreamChunk("data: [DONE]")).toBe(null);
  });
});

describe("createSSEHeaders", () => {
  test("returns correct SSE headers", () => {
    const headers = createSSEHeaders();
    expect(headers).toEqual({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  });
});
