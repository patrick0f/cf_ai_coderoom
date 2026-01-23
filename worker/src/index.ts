import type { ApiError } from "./types";

export { RoomState } from "./room-state";

export interface Env {
  ROOM_STATE: DurableObjectNamespace;
  // AI: Ai;  // Phase 3
}

const CLIENT_ID_HEADER = "X-Client-Id";

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (path === "/api/health") {
      return Response.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        phase: 2,
      });
    }

    if (method === "POST" && path === "/api/rooms") {
      return handleCreateRoom(request, env);
    }

    const roomMatch = path.match(/^\/api\/rooms\/([^/]+)\/(.+)$/);
    if (roomMatch) {
      const [, roomId, action] = roomMatch;
      return handleRoomAction(request, env, roomId, action);
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
    return stub.fetch(
      new Request("http://do/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: body.content, clientId }),
      }),
    );
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
    return errorResponse(
      "Review not implemented yet (Phase 5)",
      501,
      "NOT_IMPLEMENTED",
    );
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
