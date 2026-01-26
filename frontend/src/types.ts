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

export type RoomSnapshot = {
  roomId: string;
  createdAt: number;
  ownerClientId: string;
  messages: Message[];
  rollingSummary: string;
  pinnedPreferences: string;
  artifacts: Artifacts;
  isOwner: boolean;
};

export type ReviewResponse = {
  review: {
    ts: number;
    content: ReviewReport;
    inputHash: string;
  };
  cached: boolean;
};

export type SSEMetaEvent = { type: "meta"; seq: number };
export type SSEDeltaEvent = { type: "delta"; content: string };
export type SSEDoneEvent = { type: "done"; totalChars: number };
export type SSEErrorEvent = {
  type: "error";
  code: string;
  message: string;
  partial?: string;
};
export type SSEEvent =
  | SSEMetaEvent
  | SSEDeltaEvent
  | SSEDoneEvent
  | SSEErrorEvent;
