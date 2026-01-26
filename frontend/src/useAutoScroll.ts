import { useRef, useEffect, useCallback } from "react";

const DEFAULT_THRESHOLD = 100;

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export function isNearBottom(
  metrics: ScrollMetrics,
  threshold = DEFAULT_THRESHOLD,
): boolean {
  const { scrollTop, scrollHeight, clientHeight } = metrics;
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
  return distanceFromBottom <= threshold;
}

export function useAutoScroll<T>(dependencies: T[], streaming: boolean) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const wasNearBottomRef = useRef(true);

  const updateNearBottom = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    wasNearBottomRef.current = isNearBottom({
      scrollTop: container.scrollTop,
      scrollHeight: container.scrollHeight,
      clientHeight: container.clientHeight,
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", updateNearBottom);
    return () => container.removeEventListener("scroll", updateNearBottom);
  }, [updateNearBottom]);

  useEffect(() => {
    if (wasNearBottomRef.current && sentinelRef.current) {
      sentinelRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [dependencies, streaming]);

  return { containerRef, sentinelRef };
}
