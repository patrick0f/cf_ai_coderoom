import type { ApiError, RoomSnapshot, ReviewReport } from "./types";
import { buildChatMessages } from "./ai-context";
import { generateAssistantResponse } from "./ai-handler";
import { SYSTEM_PROMPT, AI_LIMITS, REVIEW_PROMPT } from "./prompts";
import {
  computeInputHash,
  buildReviewMessages,
  parseReviewResponse,
} from "./review-logic";

export { RoomState } from "./room-state";
export { PostMessageProcessor } from "./workflows/post-message-processor";

const CLIENT_ID_HEADER = "X-Client-Id";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/health") {
      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        phase: 5,
      });
    }

    if (method === "POST" && path === "/api/rooms") {
      return handleCreateRoom(request, env);
    }

    const roomMatch = path.match(/^\/api\/rooms\/([^/]+)\/(.+)$/);
    if (roomMatch) {
      const [, roomId, action] = roomMatch;
      return handleRoomAction(request, env, ctx, roomId, action);
    }

    return errorResponse("Not found", 404);
  },
};

async function handleCreateRoom(request: Request, env: Env): Promise<Response> {
  const clientId = request.headers.get(CLIENT_ID_HEADER);
  if (!clientId) {
    return errorResponse(
      "X-Client-Id header required",
      400,
      "MISSING_CLIENT_ID",
    );
  }

  const roomId = crypto.randomUUID();
  const doId = env.ROOM_STATE.idFromName(roomId);
  const stub = env.ROOM_STATE.get(doId);

  const initResponse = await stub.fetch(
    new Request("http://do/initialize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, clientId }),
    }),
  );

  if (!initResponse.ok) {
    return initResponse;
  }

  return Response.json(
    {
      roomId,
      joinUrl: `/${roomId}`,
    },
    { status: 201 },
  );
}

async function handleRoomAction(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  roomId: string,
  action: string,
): Promise<Response> {
  const clientId = request.headers.get(CLIENT_ID_HEADER) || "";
  const doId = env.ROOM_STATE.idFromName(roomId);
  const stub = env.ROOM_STATE.get(doId);

  if (request.method === "GET" && action === "snapshot") {
    return stub.fetch(
      new Request(
        `http://do/snapshot?clientId=${encodeURIComponent(clientId)}`,
        {
          method: "GET",
        },
      ),
    );
  }

  if (request.method === "POST" && action === "message") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    const body = (await request.json()) as { content?: string };
    const userContent = body.content || "";

    const snapshotRes = await stub.fetch(
      new Request(
        `http://do/snapshot?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET" },
      ),
    );

    if (!snapshotRes.ok) {
      return snapshotRes;
    }

    const snapshot = (await snapshotRes.json()) as RoomSnapshot;

    if (!snapshot.isOwner) {
      return errorResponse("Room owned by another session", 403, "NOT_OWNER");
    }

    const aiMessages = buildChatMessages(
      SYSTEM_PROMPT,
      snapshot.rollingSummary,
      snapshot.messages,
      AI_LIMITS.maxContextChars,
    );
    aiMessages.push({ role: "user", content: userContent });

    let assistantContent: string;
    try {
      assistantContent = await generateAssistantResponse(env.AI, aiMessages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI generation failed";
      return errorResponse(message, 500, "AI_ERROR");
    }

    const storeRes = await stub.fetch(
      new Request("http://do/messages-pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userContent,
          assistantContent,
          clientId,
        }),
      }),
    );

    if (storeRes.ok) {
      ctx.waitUntil(
        env.POST_MESSAGE_WORKFLOW.create({
          id: `${roomId}-${Date.now()}`,
          params: { roomId },
        }),
      );
    }

    return storeRes;
  }

  if (request.method === "POST" && action === "reset") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    return stub.fetch(
      new Request("http://do/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      }),
    );
  }

  if (request.method === "POST" && action === "review") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    const body = (await request.json()) as { force?: boolean };

    const snapshotRes = await stub.fetch(
      new Request(
        `http://do/snapshot?clientId=${encodeURIComponent(clientId)}`,
        { method: "GET" },
      ),
    );

    if (!snapshotRes.ok) {
      return snapshotRes;
    }

    const snapshot = (await snapshotRes.json()) as RoomSnapshot;

    if (!snapshot.isOwner) {
      return errorResponse("Room owned by another session", 403, "NOT_OWNER");
    }

    if (snapshot.messages.length === 0) {
      return errorResponse("No messages to review", 422, "NO_CONTENT");
    }

    const inputHash = await computeInputHash(
      snapshot.messages,
      snapshot.rollingSummary,
    );

    const lastReview = snapshot.artifacts.lastReview;
    if (lastReview && lastReview.inputHash === inputHash && !body.force) {
      return Response.json({ review: lastReview, cached: true });
    }

    const aiMessages = buildReviewMessages(
      REVIEW_PROMPT,
      snapshot.messages,
      snapshot.rollingSummary,
    );

    let reviewContent: string;
    try {
      reviewContent = await generateAssistantResponse(env.AI, aiMessages);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "AI generation failed";
      return errorResponse(message, 500, "AI_ERROR");
    }

    const report: ReviewReport = parseReviewResponse(reviewContent);

    const review = {
      ts: Date.now(),
      content: report,
      inputHash,
    };

    await stub.fetch(
      new Request("http://do/artifacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastReview: review }),
      }),
    );

    return Response.json({ review, cached: false });
  }

  return errorResponse("Not found", 404);
}

function errorResponse(error: string, status: number, code?: string): Response {
  const body: ApiError = { error };
  if (code) {
    body.code = code;
  }
  return Response.json(body, { status });
}
