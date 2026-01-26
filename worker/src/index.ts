import type { ApiError, RoomSnapshot, ReviewReport } from "./types";
import { buildChatMessages } from "./ai-context";
import { generateAssistantResponse } from "./ai-handler";
import { streamAssistantResponse } from "./ai-handler-stream";
import { formatSSEEvent, createSSEHeaders } from "./sse-logic";
import { SYSTEM_PROMPT, AI_LIMITS, REVIEW_PROMPT } from "./prompts";
import {
  computeInputHash,
  buildReviewMessages,
  parseReviewResponse,
} from "./review-logic";

export { RoomState } from "./room-state";
export { PostMessageProcessor } from "./workflows/post-message-processor";

const CLIENT_ID_HEADER = "X-Client-Id";

function logEvent(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ event, ...data, ts: Date.now() }));
}

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
        phase: 7,
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

  logEvent("room.created", { roomId });

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

    const rateCheck = await checkRateLimitForAction(stub, clientId, "message");
    if (!rateCheck.allowed) {
      logEvent("rate.limited", { clientId, endpoint: "message", roomId });
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter || 60),
          },
        },
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
      logEvent("message.sent", {
        roomId,
        clientId,
        contentLength: userContent.length,
      });
      ctx.waitUntil(
        env.POST_MESSAGE_WORKFLOW.create({
          id: `${roomId}-${Date.now()}`,
          params: { roomId },
        }),
      );
    }

    return storeRes;
  }

  if (request.method === "POST" && action === "message/stream") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    const rateCheck = await checkRateLimitForAction(stub, clientId, "message");
    if (!rateCheck.allowed) {
      logEvent("rate.limited", {
        clientId,
        endpoint: "message/stream",
        roomId,
      });
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter || 60),
          },
        },
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

    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    const nextSeq = snapshot.messages.length + 1;

    ctx.waitUntil(
      (async () => {
        const startTime = Date.now();
        let accumulated = "";
        let streamError: Error | null = null;

        try {
          await writer.write(
            encoder.encode(formatSSEEvent({ type: "meta", seq: nextSeq })),
          );

          logEvent("stream.started", { roomId, clientId });

          for await (const token of streamAssistantResponse(
            env.AI,
            aiMessages,
            AI_LIMITS.maxOutputChars,
          )) {
            accumulated += token;
            await writer.write(
              encoder.encode(formatSSEEvent({ type: "delta", content: token })),
            );
          }

          await stub.fetch(
            new Request("http://do/messages-pair", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userContent,
                assistantContent: accumulated,
                clientId,
              }),
            }),
          );

          ctx.waitUntil(
            env.POST_MESSAGE_WORKFLOW.create({
              id: `${roomId}-${Date.now()}`,
              params: { roomId },
            }),
          );

          const durationMs = Date.now() - startTime;
          logEvent("stream.completed", {
            roomId,
            clientId,
            totalChars: accumulated.length,
            durationMs,
          });

          await writer.write(
            encoder.encode(
              formatSSEEvent({ type: "done", totalChars: accumulated.length }),
            ),
          );
        } catch (err) {
          streamError = err instanceof Error ? err : new Error(String(err));
          const errorEvent = formatSSEEvent({
            type: "error",
            code: "STREAM_ERROR",
            message: streamError.message,
            partial: accumulated || undefined,
          });
          await writer.write(encoder.encode(errorEvent));

          logEvent("stream.error", {
            roomId,
            clientId,
            error: streamError.message,
            partialChars: accumulated.length,
          });
        } finally {
          await writer.close();
        }
      })(),
    );

    return new Response(readable, { headers: createSSEHeaders() });
  }

  if (request.method === "POST" && action === "reset") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    const resetRes = await stub.fetch(
      new Request("http://do/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      }),
    );

    if (resetRes.ok) {
      logEvent("room.reset", { roomId, clientId });
    }

    return resetRes;
  }

  if (request.method === "POST" && action === "review") {
    if (!clientId) {
      return errorResponse(
        "X-Client-Id header required",
        400,
        "MISSING_CLIENT_ID",
      );
    }

    const rateCheck = await checkRateLimitForAction(stub, clientId, "review");
    if (!rateCheck.allowed) {
      logEvent("rate.limited", { clientId, endpoint: "review", roomId });
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", code: "RATE_LIMITED" }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter || 60),
          },
        },
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
      logEvent("review.requested", { roomId, cached: true });
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

    logEvent("review.requested", { roomId, cached: false });
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

async function checkRateLimitForAction(
  stub: DurableObjectStub,
  clientId: string,
  action: "message" | "review",
): Promise<{ allowed: boolean; retryAfter?: number }> {
  const res = await stub.fetch(
    new Request("http://do/rate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, action }),
    }),
  );
  return res.json() as Promise<{ allowed: boolean; retryAfter?: number }>;
}
