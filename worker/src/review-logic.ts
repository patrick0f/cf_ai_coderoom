import type {
  Message,
  ReviewReport,
  ReviewIssue,
  RefactorSuggestion,
  ReviewSeverity,
  ReviewEffort,
} from "./types";
import type { AiMessage } from "./ai-context";

const VALID_SEVERITIES: ReviewSeverity[] = ["critical", "major", "minor"];
const VALID_EFFORTS: ReviewEffort[] = ["low", "medium", "high"];
const MAX_ARRAY_ITEMS = 5;

function formatMessages(messages: Message[]): string {
  if (messages.length === 0) {
    return "(none)";
  }
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");
}

export async function computeInputHash(
  messages: Message[],
  summary: string,
): Promise<string> {
  const content =
    messages.map((m) => `${m.role}:${m.content}`).join("|") + summary;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildReviewMessages(
  reviewPrompt: string,
  messages: Message[],
  summary: string,
): AiMessage[] {
  const summaryText = summary || "(none)";
  const messagesText = formatMessages(messages);

  return [
    {
      role: "system",
      content: reviewPrompt,
    },
    {
      role: "user",
      content: `Context summary:\n${summaryText}\n\nConversation:\n${messagesText}\n\nProvide your review as JSON.`,
    },
  ];
}

function isValidIssue(item: unknown): item is ReviewIssue {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    VALID_SEVERITIES.includes(obj.severity as ReviewSeverity) &&
    typeof obj.title === "string" &&
    typeof obj.description === "string" &&
    typeof obj.location === "string"
  );
}

function isValidRefactorSuggestion(item: unknown): item is RefactorSuggestion {
  if (typeof item !== "object" || item === null) return false;
  const obj = item as Record<string, unknown>;
  return (
    typeof obj.title === "string" &&
    typeof obj.rationale === "string" &&
    VALID_EFFORTS.includes(obj.effort as ReviewEffort)
  );
}

function createFallbackReport(summary: string): ReviewReport {
  return {
    summary,
    issues: [],
    edgeCases: [],
    refactorSuggestions: [],
    testPlan: [],
  };
}

export function parseReviewResponse(response: unknown): ReviewReport {
  if (typeof response !== "string") {
    return createFallbackReport("Invalid response");
  }

  let jsonString = response;

  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonString = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonString) as Record<string, unknown>;

    if (typeof parsed !== "object" || parsed === null) {
      return createFallbackReport(response);
    }

    const summary =
      typeof parsed.summary === "string" ? parsed.summary : "No summary";

    const issues = Array.isArray(parsed.issues)
      ? (parsed.issues.filter(isValidIssue) as ReviewIssue[]).slice(
          0,
          MAX_ARRAY_ITEMS,
        )
      : [];

    const edgeCases = Array.isArray(parsed.edgeCases)
      ? (
          parsed.edgeCases.filter((e) => typeof e === "string") as string[]
        ).slice(0, MAX_ARRAY_ITEMS)
      : [];

    const refactorSuggestions = Array.isArray(parsed.refactorSuggestions)
      ? (
          parsed.refactorSuggestions.filter(
            isValidRefactorSuggestion,
          ) as RefactorSuggestion[]
        ).slice(0, MAX_ARRAY_ITEMS)
      : [];

    const testPlan = Array.isArray(parsed.testPlan)
      ? (
          parsed.testPlan.filter((t) => typeof t === "string") as string[]
        ).slice(0, MAX_ARRAY_ITEMS)
      : [];

    return {
      summary,
      issues,
      edgeCases,
      refactorSuggestions,
      testPlan,
    };
  } catch {
    return createFallbackReport(response);
  }
}
