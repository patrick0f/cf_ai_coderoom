import { WorkflowEntrypoint, WorkflowStep } from "cloudflare:workers";
import type { WorkflowEvent } from "cloudflare:workers";
import type { RoomSnapshot } from "../types";
import { SUMMARY_PROMPT, TODO_EXTRACT_PROMPT } from "../prompts";
import {
  buildSummaryMessages,
  buildTodoExtractMessages,
  parseTodosFromResponse,
} from "../summary-logic";
import { generateAssistantResponse } from "../ai-handler";

type Params = { roomId: string };

type Env = {
  ROOM_STATE: DurableObjectNamespace;
  AI: Ai;
};

export class PostMessageProcessor extends WorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    const { roomId } = event.payload;

    const snapshot = await step.do("fetch-snapshot", async () => {
      const doId = this.env.ROOM_STATE.idFromName(roomId);
      const stub = this.env.ROOM_STATE.get(doId);

      const res = await stub.fetch(new Request("http://do/snapshot"));
      if (!res.ok) {
        throw new Error(`Failed to fetch snapshot: ${res.status}`);
      }

      return (await res.json()) as RoomSnapshot;
    });

    if (snapshot.messages.length === 0) {
      return { summary: snapshot.rollingSummary, todos: [] };
    }

    const summary = await step.do("generate-summary", async () => {
      const messages = buildSummaryMessages(
        SUMMARY_PROMPT,
        snapshot.rollingSummary,
        snapshot.messages,
      );

      const response = await generateAssistantResponse(this.env.AI, messages);
      return response.slice(0, 500);
    });

    const todos = await step.do("extract-todos", async () => {
      const messages = buildTodoExtractMessages(
        TODO_EXTRACT_PROMPT,
        snapshot.messages,
      );

      const response = await generateAssistantResponse(this.env.AI, messages);
      return parseTodosFromResponse(response);
    });

    await step.do("write-artifacts", async () => {
      const doId = this.env.ROOM_STATE.idFromName(roomId);
      const stub = this.env.ROOM_STATE.get(doId);

      const res = await stub.fetch(
        new Request("http://do/artifacts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rollingSummary: summary, todos }),
        }),
      );

      if (!res.ok) {
        throw new Error(`Failed to write artifacts: ${res.status}`);
      }
    });

    return { summary, todos };
  }
}
