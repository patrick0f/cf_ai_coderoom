import { useState, useCallback, useEffect, useRef } from "react";
import type { RoomSnapshot, ReviewResponse, SSEEvent } from "./types";

const CLIENT_ID_KEY = "coderoom_client_id";

function getOrCreateClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = crypto.randomUUID();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export function useRoom() {
  const [clientId] = useState(getOrCreateClientId);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [draftContent, setDraftContent] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    }),
    [clientId],
  );

  const createRoom = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create room");
      }
      const data = await res.json();
      setRoomId(data.roomId);
      return data.roomId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      return null;
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const fetchSnapshot = useCallback(async () => {
    if (!roomId) return;
    try {
      const res = await fetch(`/api/rooms/${roomId}/snapshot`, {
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to fetch snapshot");
      }
      const data = (await res.json()) as RoomSnapshot;
      setSnapshot(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [roomId, headers]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!roomId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${roomId}/message`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ content }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to send message");
        }
        await fetchSnapshot();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [roomId, headers, fetchSnapshot],
  );

  const sendMessageStream = useCallback(
    async (content: string) => {
      if (!roomId) return;

      let previousSnapshot: RoomSnapshot | null = null;

      setSnapshot((prev) => {
        previousSnapshot = prev;
        if (!prev) return prev;
        const nextSeq =
          prev.messages.length > 0
            ? prev.messages[prev.messages.length - 1].seq + 1
            : 1;
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              seq: nextSeq,
              role: "user" as const,
              content,
              ts: Date.now(),
            },
          ],
        };
      });

      setStreaming(true);
      setDraftContent("");
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/rooms/${roomId}/message/stream`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to stream message");
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop()!;

          for (const eventStr of events) {
            if (!eventStr.startsWith("data: ")) continue;
            const event = JSON.parse(eventStr.slice(6)) as SSEEvent;

            if (event.type === "delta") {
              setDraftContent((prev) => prev + event.content);
            } else if (event.type === "done") {
              setDraftContent("");
              await fetchSnapshot();
              setTimeout(() => fetchSnapshot(), 3000);
            } else if (event.type === "error") {
              setError(event.message);
              if (previousSnapshot) {
                setSnapshot(previousSnapshot);
              }
            }
          }
        }
      } catch (err) {
        if (previousSnapshot) {
          setSnapshot(previousSnapshot);
        }
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [roomId, headers, fetchSnapshot],
  );

  const stopGenerating = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setDraftContent("");
  }, []);

  const requestReview = useCallback(
    async (force = false): Promise<ReviewResponse | null> => {
      if (!roomId) return null;
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${roomId}/review`, {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ force }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to request review");
        }
        const data = (await res.json()) as ReviewResponse;
        await fetchSnapshot();
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        return null;
      }
    },
    [roomId, headers, fetchSnapshot],
  );

  const resetRoom = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/reset`, {
        method: "POST",
        headers: headers(),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reset room");
      }
      await fetchSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [roomId, headers, fetchSnapshot]);

  useEffect(() => {
    if (roomId) {
      fetchSnapshot();
    }
  }, [roomId, fetchSnapshot]);

  return {
    clientId,
    roomId,
    snapshot,
    loading,
    error,
    streaming,
    draftContent,
    createRoom,
    sendMessage,
    sendMessageStream,
    stopGenerating,
    requestReview,
    resetRoom,
    fetchSnapshot,
  };
}
