import type { SSEEvent } from "./sse-types";

export function formatSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseAIStreamChunk(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Workers AI streaming returns SSE format: "data: {json}"
  const jsonStr = trimmed.startsWith("data:")
    ? trimmed.slice(5).trim()
    : trimmed;

  // Handle [DONE] marker
  if (jsonStr === "[DONE]") return null;

  try {
    const parsed = JSON.parse(jsonStr) as { response?: string };
    return parsed.response ?? null;
  } catch {
    return null;
  }
}

export function createSSEHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  };
}
