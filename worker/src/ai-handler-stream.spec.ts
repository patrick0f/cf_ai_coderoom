import { describe, expect, test } from "vitest";
import { processAIStream, type StreamResult } from "./ai-handler-stream";

function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

async function collectStream(
  stream: ReadableStream<Uint8Array>,
  maxChars: number,
): Promise<StreamResult> {
  const tokens: string[] = [];
  let result: StreamResult = { tokens: [], accumulated: "", truncated: false };

  for await (const token of processAIStream(stream, maxChars)) {
    tokens.push(token);
  }

  const accumulated = tokens.join("");
  result = {
    tokens,
    accumulated,
    truncated: accumulated.length >= maxChars,
  };
  return result;
}

describe("processAIStream", () => {
  test("yields tokens from single chunk", async () => {
    const stream = createMockStream([
      '{"response":"Hello"}\n{"response":" world"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["Hello", " world"]);
    expect(result.accumulated).toBe("Hello world");
  });

  test("yields tokens from multiple chunks", async () => {
    const stream = createMockStream([
      '{"response":"One"}',
      '\n{"response":"Two"}',
      '\n{"response":"Three"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["One", "Two", "Three"]);
    expect(result.accumulated).toBe("OneTwoThree");
  });

  test("handles empty lines", async () => {
    const stream = createMockStream(['{"response":"A"}\n\n{"response":"B"}\n']);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["A", "B"]);
  });

  test("handles invalid JSON lines gracefully", async () => {
    const stream = createMockStream([
      '{"response":"Valid"}\n{invalid json}\n{"response":"Also valid"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["Valid", "Also valid"]);
  });

  test("handles JSON without response field", async () => {
    const stream = createMockStream([
      '{"response":"Token"}\n{"other":"field"}\n{"response":"Next"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["Token", "Next"]);
  });

  test("truncates output at maxChars limit", async () => {
    const stream = createMockStream([
      '{"response":"AAAAAAAAAA"}',
      '\n{"response":"BBBBBBBBBB"}',
      '\n{"response":"CCCCCCCCCC"}',
    ]);
    const result = await collectStream(stream, 15);

    expect(result.accumulated.length).toBeLessThanOrEqual(15);
    expect(result.tokens.join("").length).toBeLessThanOrEqual(15);
  });

  test("handles empty stream", async () => {
    const stream = createMockStream([]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual([]);
    expect(result.accumulated).toBe("");
  });

  test("handles stream with only invalid content", async () => {
    const stream = createMockStream(["{invalid}", "not json", ""]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual([]);
    expect(result.accumulated).toBe("");
  });

  test("handles special characters in response", async () => {
    const stream = createMockStream([
      '{"response":"function() {\\n  return 42;\\n}"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["function() {\n  return 42;\n}"]);
  });

  test("handles partial JSON across chunks", async () => {
    const stream = createMockStream([
      '{"response":"First"}\n{"respo',
      'nse":"Second"}',
    ]);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toContain("First");
    expect(result.tokens).toContain("Second");
  });

  test("handles data: prefix in lines (SSE format from Workers AI)", async () => {
    const stream = createMockStream(['data: {"response":"token"}\n']);
    const result = await collectStream(stream, 1000);

    expect(result.tokens).toEqual(["token"]);
  });
});
