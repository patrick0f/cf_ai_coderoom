import type { AiMessage } from "./ai-context";
import { AI_LIMITS } from "./prompts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export async function generateAssistantResponse(
  ai: Ai,
  messages: AiMessage[],
): Promise<string> {
  const response = await ai.run(MODEL, { messages, max_tokens: 4096 });

  if (!response || typeof response !== "object" || !("response" in response)) {
    throw new Error("Invalid AI response format");
  }

  const rawContent = (response as { response: unknown }).response;

  let content: string;

  if (typeof rawContent === "string") {
    content = rawContent;
  } else if (rawContent !== null && typeof rawContent === "object") {
    content = JSON.stringify(rawContent);
  } else {
    throw new Error("AI response content is not a string or object");
  }

  if (content.length > AI_LIMITS.maxOutputChars) {
    content = content.slice(0, AI_LIMITS.maxOutputChars);
  }

  return content;
}
