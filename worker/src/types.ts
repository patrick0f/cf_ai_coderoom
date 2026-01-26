export type Message = {
  seq: number;
  role: "user" | "assistant";
  content: string;
  ts: number;
  clientId?: string;
};

export type ReviewSeverity = "critical" | "major" | "minor";
export type ReviewEffort = "low" | "medium" | "high";

export type ReviewIssue = {
  severity: ReviewSeverity;
  title: string;
  description: string;
  location: string;
};

export type RefactorSuggestion = {
  title: string;
  rationale: string;
  effort: ReviewEffort;
};

export type ReviewReport = {
  summary: string;
  issues: ReviewIssue[];
  edgeCases: string[];
  refactorSuggestions: RefactorSuggestion[];
  testPlan: string[];
};

export type Artifacts = {
  lastReview: { ts: number; content: ReviewReport; inputHash: string } | null;
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
  rateLimits: Record<string, RateLimitEntry>;
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

export type RateLimitEntry = {
  count: number;
  resetAt: number;
};

export type RateLimitConfig = {
  maxRequests: number;
  windowMs: number;
};
