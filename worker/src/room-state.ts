import type { RoomData, RoomSnapshot, ApiError, ReviewReport } from "./types";
import { LIMITS } from "./types";
import {
  boundMessages,
  createRoomData,
  createMessage,
  validateMessageContent,
} from "./room-logic";
import { checkRateLimit, RATE_LIMITS } from "./rate-limit";

const STORAGE_KEY = "room";

export class RoomState implements DurableObject {
  constructor(
    private ctx: DurableObjectState,
    _env: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/initialize") {
        return this.handleInitialize(request);
      }

      if (request.method === "GET" && path === "/snapshot") {
        return this.handleGetSnapshot(request);
      }

      if (request.method === "POST" && path === "/message") {
        return this.handleAddMessage(request);
      }

      if (request.method === "POST" && path === "/reset") {
        return this.handleReset(request);
      }

      if (request.method === "POST" && path === "/messages-pair") {
        return this.handleMessagesPair(request);
      }

      if (request.method === "POST" && path === "/artifacts") {
        return this.handleUpdateArtifacts(request);
      }

      if (request.method === "POST" && path === "/rate-check") {
        return this.handleRateCheck(request);
      }

      return this.errorResponse("Not found", 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Internal error";
      return this.errorResponse(message, 500);
    }
  }

  private async handleInitialize(request: Request): Promise<Response> {
    const body = (await request.json()) as { roomId: string; clientId: string };
    const { roomId, clientId } = body;

    if (!roomId || !clientId) {
      return this.errorResponse(
        "roomId and clientId required",
        400,
        "MISSING_PARAMS",
      );
    }

    const existing = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (existing) {
      return this.errorResponse("Room already exists", 409, "ROOM_EXISTS");
    }

    const roomData = createRoomData(roomId, clientId);
    await this.ctx.storage.put(STORAGE_KEY, roomData);

    return Response.json({ success: true, roomId });
  }

  private async handleGetSnapshot(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("clientId") || "";

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    const snapshot: RoomSnapshot = {
      ...roomData,
      isOwner: roomData.ownerClientId === clientId,
    };

    return Response.json(snapshot);
  }

  private async handleAddMessage(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      content: string;
      clientId: string;
    };
    const { content, clientId } = body;

    if (!clientId) {
      return this.errorResponse("clientId required", 400, "MISSING_CLIENT_ID");
    }

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    if (roomData.ownerClientId !== clientId) {
      return this.errorResponse(
        "Room owned by another session",
        403,
        "NOT_OWNER",
      );
    }

    const validation = validateMessageContent(content);
    if (!validation.valid) {
      return this.errorResponse(validation.error, 400, validation.code);
    }

    const message = createMessage(content, "user", roomData.messages, clientId);
    roomData.messages = boundMessages(
      [...roomData.messages, message],
      LIMITS.maxMessages,
    );

    await this.ctx.storage.put(STORAGE_KEY, roomData);

    return Response.json({ seq: message.seq, message });
  }

  private async handleReset(request: Request): Promise<Response> {
    const body = (await request.json()) as { clientId: string };
    const { clientId } = body;

    if (!clientId) {
      return this.errorResponse("clientId required", 400, "MISSING_CLIENT_ID");
    }

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    if (roomData.ownerClientId !== clientId) {
      return this.errorResponse(
        "Room owned by another session",
        403,
        "NOT_OWNER",
      );
    }

    const resetData = createRoomData(roomData.roomId, roomData.ownerClientId);
    resetData.createdAt = roomData.createdAt;

    await this.ctx.storage.put(STORAGE_KEY, resetData);

    return Response.json({ success: true });
  }

  private async handleMessagesPair(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      userContent: string;
      assistantContent: string;
      clientId: string;
    };
    const { userContent, assistantContent, clientId } = body;

    if (!clientId) {
      return this.errorResponse("clientId required", 400, "MISSING_CLIENT_ID");
    }

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    if (roomData.ownerClientId !== clientId) {
      return this.errorResponse(
        "Room owned by another session",
        403,
        "NOT_OWNER",
      );
    }

    const userValidation = validateMessageContent(userContent);
    if (!userValidation.valid) {
      return this.errorResponse(userValidation.error, 400, userValidation.code);
    }

    const userMessage = createMessage(
      userContent,
      "user",
      roomData.messages,
      clientId,
    );
    const messagesWithUser = [...roomData.messages, userMessage];

    const assistantMessage = createMessage(
      assistantContent,
      "assistant",
      messagesWithUser,
    );

    roomData.messages = boundMessages(
      [...messagesWithUser, assistantMessage],
      LIMITS.maxMessages,
    );

    await this.ctx.storage.put(STORAGE_KEY, roomData);

    return Response.json({
      userMessage,
      assistantMessage,
    });
  }

  private async handleUpdateArtifacts(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      rollingSummary?: string;
      todos?: string[];
      lastReview?: { ts: number; content: ReviewReport; inputHash: string };
    };
    const { rollingSummary, todos, lastReview } = body;

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    if (rollingSummary !== undefined) {
      roomData.rollingSummary = rollingSummary;
    }

    if (todos !== undefined) {
      roomData.artifacts.todos = {
        ts: Date.now(),
        items: todos,
      };
    }

    if (lastReview !== undefined) {
      roomData.artifacts.lastReview = lastReview;
    }

    await this.ctx.storage.put(STORAGE_KEY, roomData);

    return Response.json({ success: true });
  }

  private async handleRateCheck(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      clientId: string;
      action: "message" | "review";
    };
    const { clientId, action } = body;

    if (!clientId || !action) {
      return this.errorResponse(
        "clientId and action required",
        400,
        "MISSING_PARAMS",
      );
    }

    const config = RATE_LIMITS[action];
    if (!config) {
      return this.errorResponse("Invalid action", 400, "INVALID_ACTION");
    }

    const roomData = await this.ctx.storage.get<RoomData>(STORAGE_KEY);
    if (!roomData) {
      return this.errorResponse("Room not found", 404, "ROOM_NOT_FOUND");
    }

    const key = `${clientId}:${action}`;
    const result = checkRateLimit(roomData.rateLimits, key, config, Date.now());

    roomData.rateLimits[key] = result.updated;
    await this.ctx.storage.put(STORAGE_KEY, roomData);

    return Response.json({
      allowed: result.allowed,
      retryAfter: result.retryAfter,
    });
  }

  private errorResponse(
    error: string,
    status: number,
    code?: string,
  ): Response {
    const body: ApiError = { error };
    if (code) {
      body.code = code;
    }
    return Response.json(body, { status });
  }
}
