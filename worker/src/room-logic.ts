import type { Message, RoomData } from "./types";
import { LIMITS } from "./types";

export function boundMessages(messages: Message[], max: number): Message[] {
  if (messages.length <= max) {
    return messages;
  }
  return messages.slice(-max);
}

export function createRoomData(
  roomId: string,
  ownerClientId: string,
): RoomData {
  return {
    roomId,
    createdAt: Date.now(),
    ownerClientId,
    messages: [],
    rollingSummary: "",
    pinnedPreferences: "",
    artifacts: {
      lastReview: null,
      todos: null,
      notes: "",
    },
    rateLimits: {},
  };
}

export function createMessage(
  content: string,
  role: "user" | "assistant",
  existingMessages: Message[],
  clientId?: string,
): Message {
  const lastSeq =
    existingMessages.length > 0
      ? existingMessages[existingMessages.length - 1].seq
      : 0;

  const message: Message = {
    seq: lastSeq + 1,
    role,
    content,
    ts: Date.now(),
  };

  if (clientId !== undefined) {
    message.clientId = clientId;
  }

  return message;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; code: string };

export function validateMessageContent(content: string): ValidationResult {
  if (!content.trim()) {
    return {
      valid: false,
      error: "Message content cannot be empty",
      code: "EMPTY_CONTENT",
    };
  }

  if (content.length > LIMITS.maxCharsPerMessage) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${LIMITS.maxCharsPerMessage} characters`,
      code: "CONTENT_TOO_LONG",
    };
  }

  return { valid: true };
}
