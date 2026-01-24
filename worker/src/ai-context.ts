import type { Message } from "./types";

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export function buildChatMessages(
  systemPrompt: string,
  rollingSummary: string,
  messages: Message[],
  maxChars: number,
): AiMessage[] {
  const systemContent = rollingSummary
    ? `${systemPrompt}\n\nContext from previous conversation:\n${rollingSummary}`
    : systemPrompt;

  const systemMessage: AiMessage = { role: "system", content: systemContent };
  const result: AiMessage[] = [systemMessage];

  let totalChars = systemContent.length;

  const messageQueue: AiMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (const msg of messageQueue) {
    totalChars += msg.content.length;
  }

  while (messageQueue.length > 0 && totalChars > maxChars) {
    const removed = messageQueue.shift()!;
    totalChars -= removed.content.length;
  }

  result.push(...messageQueue);

  return result;
}
