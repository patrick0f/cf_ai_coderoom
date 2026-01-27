import type { AiMessage } from "./ai-context";
import { parseAIStreamChunk } from "./sse-logic";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export type StreamResult = {
  tokens: string[];
  accumulated: string;
  truncated: boolean;
};

export async function* processAIStream(
  stream: ReadableStream<Uint8Array>,
  maxChars: number,
): AsyncGenerator<string, void, unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const token = parseAIStreamChunk(line);
        if (token !== null) {
          if (accumulated.length + token.length > maxChars) {
            const remaining = maxChars - accumulated.length;
            if (remaining > 0) {
              const truncatedToken = token.slice(0, remaining);
              accumulated += truncatedToken;
              yield truncatedToken;
            }
            return;
          }
          accumulated += token;
          yield token;
        }
      }
    }

    if (buffer.trim()) {
      const token = parseAIStreamChunk(buffer);
      if (token !== null && accumulated.length + token.length <= maxChars) {
        yield token;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function* streamAssistantResponse(
  ai: Ai,
  messages: AiMessage[],
  maxChars: number,
): AsyncGenerator<string, string, unknown> {
  const stream = (await ai.run(MODEL, {
    messages,
    stream: true,
    max_tokens: 4096,
  })) as ReadableStream<Uint8Array>;

  let accumulated = "";
  for await (const token of processAIStream(stream, maxChars)) {
    accumulated += token;
    yield token;
  }
  return accumulated;
}
