import { useState, useCallback, useEffect } from "react";
import type { RoomSnapshot, ReviewResponse } from "./types";

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

  const headers = useCallback(
    () => ({
      "Content-Type": "application/json",
      "X-Client-Id": clientId,
    }),
    [clientId]
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

        // Poll for artifact updates from background workflow
        const pollForArtifacts = async () => {
          const maxPolls = 5;
          const pollInterval = 3000;
          for (let i = 0; i < maxPolls; i++) {
            await new Promise((r) => setTimeout(r, pollInterval));
            await fetchSnapshot();
          }
        };
        pollForArtifacts();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [roomId, headers, fetchSnapshot]
  );

  const requestReview = useCallback(
    async (force = false): Promise<ReviewResponse | null> => {
      if (!roomId) return null;
      setLoading(true);
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
      } finally {
        setLoading(false);
      }
    },
    [roomId, headers, fetchSnapshot]
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
    createRoom,
    sendMessage,
    requestReview,
    resetRoom,
    fetchSnapshot,
  };
}
