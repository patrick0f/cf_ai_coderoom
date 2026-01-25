import type { Message } from "./types";
import type { AiMessage } from "./ai-context";

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) {
    return "(none)";
  }
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

export function buildSummaryMessages(
  summaryPrompt: string,
  currentSummary: string,
  messages: Message[],
): AiMessage[] {
  const summaryText = currentSummary || "(none)";
  const messagesText = formatMessages(messages);

  return [
    {
      role: "system",
      content: summaryPrompt,
    },
    {
      role: "user",
      content: `Current summary:\n${summaryText}\n\nRecent messages:\n${messagesText}\n\nOutput only the updated summary.`,
    },
  ];
}

export function buildTodoExtractMessages(
  todoPrompt: string,
  messages: Message[],
): AiMessage[] {
  const messagesText = formatMessages(messages);

  return [
    {
      role: "system",
      content: todoPrompt,
    },
    {
      role: "user",
      content: `Conversation:\n${messagesText}\n\nOutput only a valid JSON array of strings.`,
    },
  ];
}

export function parseTodosFromResponse(response: unknown): string[] {
  if (Array.isArray(response)) {
    const strings = response.filter(
      (item): item is string => typeof item === "string",
    );
    return strings.slice(0, 10);
  }

  if (typeof response !== "string") {
    return [];
  }

  let jsonString = response;

  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  } else {
    const arrayMatch = response.match(/\[[\s\S]*?\]/);
    if (arrayMatch) {
      jsonString = arrayMatch[0];
    }
  }

  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const strings = parsed.filter(
      (item): item is string => typeof item === "string",
    );
    return strings.slice(0, 10);
  } catch {
    return [];
  }
}
