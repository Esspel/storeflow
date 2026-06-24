import { useCallback, useRef, useState } from "react";

/**
 * Simple virtual list for scrollable containers with roughly fixed row heights.
 * Renders only the visible slice + overscan rows to keep DOM element count low.
 */
export function useVirtualList<T>(
  items: T[],
  rowHeight = 56,
  overscan = 5,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const containerHeight = scrollRef.current?.clientHeight ?? 600;
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
