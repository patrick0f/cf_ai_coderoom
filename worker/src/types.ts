export type Message = {
  seq: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  clientId?: string;
};

export type Artifacts = {
  lastReview: { ts: number; content: string; inputHash: string } | null;
  todos: { ts: number; items: string[] } | null;
  notes: string;
};

export type RoomData = {
  roomId: string;
  createdAt: number;
  ownerClientId: string;
  messages: Message[];
  rollingSummary: string;
  pinnedPreferences: string;
  artifacts: Artifacts;
};

export type RoomSnapshot = RoomData & {
  isOwner: boolean;
};

export type ApiError = {
  error: string;
  code?: string;
};

export const LIMITS = {
  maxMessages: 30,
  maxCharsPerMessage: 10000,
} as const;
