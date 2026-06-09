import { useEffect, useRef, useState, type RefObject } from "react";

const PULL_THRESHOLD = 72;

export function usePullToRefresh(
  onRefresh: () => Promise<void>,
  enabled: boolean,
  scrollRef: RefObject<HTMLElement | null>,
): { pulling: boolean; refreshing: boolean; pullDistance: number } {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const pullDeltaRef = useRef(0);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    const onTouchStart = (e: TouchEvent) => {
      if (el.scrollTop > 0) return;
      touchStartY.current = e.touches[0]?.clientY ?? 0;
      pullDeltaRef.current = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      const delta = Math.max(0, y - touchStartY.current);
      if (delta > 0 && el.scrollTop <= 0) {
        pullDeltaRef.current = delta;
        setPullDistance(Math.min(delta, PULL_THRESHOLD * 1.5));
        if (delta > 10) e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      const shouldRefresh = pullDeltaRef.current >= PULL_THRESHOLD;
      pullDeltaRef.current = 0;
      setPullDistance(0);
      if (!shouldRefresh) return;
      setRefreshing(true);
      void onRefreshRef.current().finally(() => setRefreshing(false));
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [enabled, scrollRef]);

  return { pulling: pullDistance > 0, refreshing, pullDistance };
}
