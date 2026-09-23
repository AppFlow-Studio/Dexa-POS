import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  View,
} from "react-native";

import type { KDSTicket } from "@/types/kds";

/**
 * The KDS ticket board: tickets flow left to right across `columns` columns
 * (ticket i goes to column i % columns) and the whole board scrolls as one
 * surface.
 *
 * Every card is keyed by ticket_id and absolutely positioned inside a single
 * ScrollView. Bumping the front ticket shifts every later ticket to a new
 * column — inherent to left-to-right flow. Column lists (and the nested lists
 * inside MasonryFlashList) can only express that by re-rendering or
 * remounting every card that moved, which froze low-end tablets for seconds
 * per bump. Here a bump recomputes positions arithmetically from cached
 * heights; moved cards receive a new left/top and their memoized bodies skip
 * rendering entirely.
 *
 * Heights are measured once per ticket (onLayout on the slot's inner view,
 * which only fires on a size change, never on a move) and cached per width,
 * so tab switches and remounts lay out exactly on the first pass. Cards far
 * outside the viewport are not mounted.
 */

interface KDSTicketBoardProps {
  tickets: KDSTicket[];
  columns: number;
  renderCard: (ticket: KDSTicket) => React.ReactElement;
  /** First-paint height guess for a ticket not measured yet. */
  estimateHeight: (ticket: KDSTicket) => number;
  /** Separates cached heights for card variants that render the same ticket differently (e.g. done vs active). */
  cacheNamespace: string;
  horizontalPadding: number;
  cellGutter: number;
  topPadding: number;
  bottomPadding: number;
  /** Tapping the empty space below the grid. */
  onPressFooter?: () => void;
  footerHeight: number;
}

// Rendered window around the viewport, in viewport heights. Generous below so
// a normal scroll never reaches unmounted cards.
const WINDOW_ABOVE = 1;
const WINDOW_BELOW = 2;
const MAX_CACHED_HEIGHTS = 600;

// Module-level so a tab switch (which remounts the board) keeps its layout.
// Key: `${namespace}|${roundedWidth}|${ticketId}`.
const heightCache = new Map<string, number>();

function pruneHeightCache(live: Set<string>) {
  if (heightCache.size <= MAX_CACHED_HEIGHTS) return;
  for (const key of heightCache.keys()) {
    if (!live.has(key)) heightCache.delete(key);
  }
}

interface SlotProps {
  ticket: KDSTicket;
  left: number;
  top: number;
  width: number;
  gutter: number;
  renderCard: (ticket: KDSTicket) => React.ReactElement;
  onMeasured: (ticketId: string, height: number) => void;
}

const TicketSlot = React.memo(function TicketSlot({
  ticket,
  left,
  top,
  width,
  gutter,
  renderCard,
  onMeasured,
}: SlotProps) {
  const ticketId = ticket.ticket_id;
  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => onMeasured(ticketId, e.nativeEvent.layout.height),
    [ticketId, onMeasured],
  );
  return (
    <View style={{ position: "absolute", left, top, width }}>
      <View onLayout={handleLayout} style={{ paddingHorizontal: gutter }}>
        {renderCard(ticket)}
      </View>
    </View>
  );
});

export default function KDSTicketBoard({
  tickets,
  columns,
  renderCard,
  estimateHeight,
  cacheNamespace,
  horizontalPadding,
  cellGutter,
  topPadding,
  bottomPadding,
  onPressFooter,
  footerHeight,
}: KDSTicketBoardProps) {
  const [width, setWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  // Scroll position the rendered window is anchored to. Updated only when the
  // scroll moves half a viewport away, not per scroll event.
  const [windowAnchor, setWindowAnchor] = useState(0);
  const [measureVersion, setMeasureVersion] = useState(0);
  const relayoutFrame = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (relayoutFrame.current != null)
        cancelAnimationFrame(relayoutFrame.current);
    },
    [],
  );

  const widthKey = Math.round(width);
  const cacheKey = useCallback(
    (ticketId: string) => `${cacheNamespace}|${widthKey}|${ticketId}`,
    [cacheNamespace, widthKey],
  );

  // Several cards report heights in the same frame on mount; fold them into
  // one relayout.
  const handleMeasured = useCallback(
    (ticketId: string, height: number) => {
      const key = cacheKey(ticketId);
      const prev = heightCache.get(key);
      if (prev !== undefined && Math.abs(prev - height) < 0.5) return;
      heightCache.set(key, height);
      if (relayoutFrame.current != null) return;
      relayoutFrame.current = requestAnimationFrame(() => {
        relayoutFrame.current = null;
        setMeasureVersion((v) => v + 1);
      });
    },
    [cacheKey],
  );

  const layout = useMemo(() => {
    const columnWidth =
      columns > 0 ? Math.max(0, (width - horizontalPadding * 2) / columns) : 0;
    const columnBottoms = new Array<number>(Math.max(columns, 1)).fill(
      topPadding,
    );
    const live = new Set<string>();
    const slots = tickets.map((ticket, i) => {
      const column = i % Math.max(columns, 1);
      const key = cacheKey(ticket.ticket_id);
      live.add(key);
      const height = heightCache.get(key) ?? estimateHeight(ticket);
      const top = columnBottoms[column];
      columnBottoms[column] = top + height;
      return {
        ticket,
        left: horizontalPadding + column * columnWidth,
        top,
        height,
      };
    });
    pruneHeightCache(live);
    const gridBottom = Math.max(...columnBottoms) + bottomPadding;
    return { slots, columnWidth, gridBottom };
    // measureVersion: re-read heightCache after new measurements land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tickets,
    columns,
    width,
    horizontalPadding,
    topPadding,
    bottomPadding,
    cacheKey,
    estimateHeight,
    measureVersion,
  ]);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    setViewportHeight((prev) => (Math.abs(prev - h) < 0.5 ? prev : h));
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      setWindowAnchor((anchor) =>
        Math.abs(y - anchor) > viewportHeight / 2 ? y : anchor,
      );
    },
    [viewportHeight],
  );

  const windowTop = windowAnchor - viewportHeight * WINDOW_ABOVE;
  const windowBottom = windowAnchor + viewportHeight * (1 + WINDOW_BELOW);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ height: layout.gridBottom + footerHeight }}
      onLayout={handleContainerLayout}
      onScroll={handleScroll}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator
    >
      {width > 0 &&
        layout.slots.map((slot) =>
          slot.top < windowBottom && slot.top + slot.height > windowTop ? (
            <TicketSlot
              key={slot.ticket.ticket_id}
              ticket={slot.ticket}
              left={slot.left}
              top={slot.top}
              width={layout.columnWidth}
              gutter={cellGutter}
              renderCard={renderCard}
              onMeasured={handleMeasured}
            />
          ) : null,
        )}
      {onPressFooter && (
        <Pressable
          onPress={onPressFooter}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: layout.gridBottom,
            height: footerHeight,
          }}
        />
      )}
    </ScrollView>
  );
}
