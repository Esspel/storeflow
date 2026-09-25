import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Simple virtual list for scrollable containers with roughly fixed row heights.
 * Renders only the visible slice + overscan rows to keep DOM element count low.
 */
export function useVirtualList<T>(items: T[], rowHeight = 56, overscan = 5) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  useEffect(() => {
    const syncHeight = () => {
      const update = () => setContainerHeight(scrollRef.current?.clientHeight ?? 600);
      update();
    };
    syncHeight();
    window.addEventListener("resize", syncHeight);
    return () => window.removeEventListener("resize", syncHeight);
  }, []);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(
    items.length,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan,
  );

  return {
    scrollRef,
    onScroll,
    visibleItems: items.slice(startIndex, endIndex),
    paddingTop: startIndex * rowHeight,
    paddingBottom: Math.max(0, (items.length - endIndex) * rowHeight),
  };
}
