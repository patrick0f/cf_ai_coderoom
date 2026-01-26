import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { unstable_dev } from "wrangler";
import type { UnstableDevWorker } from "wrangler";

describe("Room API", () => {
  let worker: UnstableDevWorker;

  beforeAll(async () => {
    worker = await unstable_dev("src/index.ts", {
      experimental: { disableExperimentalWarning: true },
    });
  }, 30000);

  afterAll(async () => {
    await worker.stop();
  });

  test("GET /api/health returns status ok", async () => {
    const res = await worker.fetch("/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; phase: number };
    expect(body.status).toBe("ok");
    expect(body.phase).toBe(6);
  });

  test("POST /api/rooms requires X-Client-Id header", async () => {
    const res = await worker.fetch("/api/rooms", { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("MISSING_CLIENT_ID");
  });

  test("POST /api/rooms creates room and returns roomId", async () => {
    const res = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": "test-client-1" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { roomId: string; joinUrl: string };
    expect(body.roomId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.joinUrl).toBe(`/${body.roomId}`);
  });

  test("GET /api/rooms/:id/snapshot returns room state", async () => {
    const clientId = "test-client-2";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/snapshot`, {
      headers: { "X-Client-Id": clientId },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      roomId: string;
      isOwner: boolean;
      messages: unknown[];
    };
    expect(body.roomId).toBe(roomId);
    expect(body.isOwner).toBe(true);
    expect(body.messages).toEqual([]);
  });

  test("GET /api/rooms/:id/snapshot returns 404 for non-existent room", async () => {
    const res = await worker.fetch("/api/rooms/nonexistent-room-id/snapshot");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("ROOM_NOT_FOUND");
  });

  test("GET /api/rooms/:id/snapshot shows isOwner false for different client", async () => {
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": "owner-client" },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/snapshot`, {
      headers: { "X-Client-Id": "other-client" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { isOwner: boolean };
    expect(body.isOwner).toBe(false);
  });

  test("POST /api/rooms/:id/message adds message with AI response", async () => {
    const clientId = "test-client-3";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Hello, world!" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userMessage: { seq: number; role: string; content: string };
      assistantMessage: { seq: number; role: string; content: string };
    };
    expect(body.userMessage.seq).toBe(1);
    expect(body.userMessage.content).toBe("Hello, world!");
    expect(body.userMessage.role).toBe("user");
    expect(body.assistantMessage.seq).toBe(2);
    expect(body.assistantMessage.role).toBe("assistant");
    expect(body.assistantMessage.content).toBeTruthy();
  }, 30000);

  test("POST /api/rooms/:id/message returns 403 for wrong clientId", async () => {
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": "owner-client-4" },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": "wrong-client",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Should fail" }),
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_OWNER");
  });

  test("POST /api/rooms/:id/message returns 400 for empty content", async () => {
    const clientId = "test-client-5";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("EMPTY_CONTENT");
  });

  test("POST /api/rooms/:id/message returns 400 for content over limit", async () => {
    const clientId = "test-client-6";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const longContent = "a".repeat(10001);
    const res = await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: longContent }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("CONTENT_TOO_LONG");
  });

  test("messages include both user and assistant after send", async () => {
    const clientId = "test-client-7";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Test message" }),
    });

    const snapshotRes = await worker.fetch(`/api/rooms/${roomId}/snapshot`, {
      headers: { "X-Client-Id": clientId },
    });
    const body = (await snapshotRes.json()) as {
      messages: { seq: number; role: string; content: string }[];
    };
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toBe("Test message");
    expect(body.messages[1].role).toBe("assistant");
  }, 30000);

  test("POST /api/rooms/:id/reset clears room state", async () => {
    const clientId = "test-client-8";
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    await worker.fetch(`/api/rooms/${roomId}/message`, {
      method: "POST",
      headers: {
        "X-Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "Test message" }),
    });

    const resetRes = await worker.fetch(`/api/rooms/${roomId}/reset`, {
      method: "POST",
      headers: { "X-Client-Id": clientId },
    });
    expect(resetRes.status).toBe(200);

    const snapshotRes = await worker.fetch(`/api/rooms/${roomId}/snapshot`, {
      headers: { "X-Client-Id": clientId },
    });
    const body = (await snapshotRes.json()) as { messages: unknown[] };
    expect(body.messages).toEqual([]);
  });

  test("POST /api/rooms/:id/reset returns 403 for wrong clientId", async () => {
    const createRes = await worker.fetch("/api/rooms", {
      method: "POST",
      headers: { "X-Client-Id": "owner-client-9" },
    });
    const { roomId } = (await createRes.json()) as { roomId: string };

    const res = await worker.fetch(`/api/rooms/${roomId}/reset`, {
      method: "POST",
      headers: { "X-Client-Id": "wrong-client" },
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("NOT_OWNER");
  });
});
