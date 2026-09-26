/**
 * Responsive, virtualized grid of item cards, shared by the Items tab and a
 * category's detail pane.
 *
 * Column count follows the measured width (see `computeItemGridMetrics`). Each
 * FlashList cell is a whole row with explicit width AND height, because
 * FlashList positions cells but does not size them.
 *
 * The card is the unit of cost: a scroll mounts a row of them per frame, so it
 * is kept deliberately cheap for low-end tablets:
 * - one style object per grid size, shared by every card (no per-card style
 *   building, no hooks inside the card);
 * - `Pressable` with a native ripple, not `TouchableOpacity` (which adds an
 *   Animated view per touchable);
 * - text-only actions and badges, so a card mounts at most one SVG (the
 *   placeholder when there is no photo), down from up to six;
 * - a field-level memo check, so a sync that replaces every item object but
 *   changes nothing visible re-renders no card.
 */
import { FlashList } from "@shopify/flash-list";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import MenuManagementImage from "@/components/menu/MenuManagementImage";
import { isItemOnChannel } from "@/lib/menu/itemChannelVisibility";
import {
  buildItemGridRows,
  computeItemGridMetrics,
  type ItemGridMetrics,
  type ItemGridRow,
} from "@/lib/menu/menuManagementGrid";
import { getItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import { formatSnoozeCountdown } from "@/lib/snoozeDurations";
import { colors } from "@/lib/theme";
import type { MenuItemType } from "@/lib/types";
import { formatCurrency } from "@/utils/currency";

import { useMenuManagement, type ItemOpenContext } from "./context";
import { useS } from "./ui";

// ---------------------------------------------------------------------------
// Styles (one set per grid size)
// ---------------------------------------------------------------------------

function buildCardStyles(m: ItemGridMetrics, s: (n: number) => number) {
  const badgeHeight = s(20);
  const actionHeight = m.body.actionsHeight;
  const badge = {
    height: badgeHeight,
    paddingHorizontal: s(7),
    borderRadius: badgeHeight / 2,
    justifyContent: "center" as const,
  };
  const action = {
    flex: 1,
    height: actionHeight,
    borderRadius: s(8),
    borderWidth: 1,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  };
  return {
    row: { height: m.rowHeight, flexDirection: "row" as const, gap: m.gap },
    header: { height: m.headerHeight, justifyContent: "center" as const },
    headerText: {
      fontSize: s(12),
      fontWeight: "700" as const,
      color: colors.muted,
      letterSpacing: 1,
    },
    card: {
      width: m.cardWidth,
      height: m.cardHeight,
      borderRadius: s(12),
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.panel,
      overflow: "hidden" as const,
    },
    imageBox: {
      height: m.imageHeight,
      backgroundColor: colors.card,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    },
    image: { width: "100%" as const, height: "100%" as const },
    imageDimmed: { width: "100%" as const, height: "100%" as const, opacity: 0.45 },
    placeholderDimmed: { opacity: 0.45 },
    placeholderSize: s(26),
    badges: {
      position: "absolute" as const,
      top: s(8),
      left: s(8),
      right: s(8),
      flexDirection: "row" as const,
      flexWrap: "wrap" as const,
      gap: s(4),
    },
    badgeDanger: { ...badge, backgroundColor: colors.danger },
    badgeNeutral: { ...badge, backgroundColor: colors.label },
    badgeWarning: { ...badge, backgroundColor: colors.warning },
    badgeText: {
      fontSize: s(10),
      fontWeight: "700" as const,
      color: colors.onSolid,
    },
    body: {
      flex: 1,
      paddingTop: m.body.paddingTop,
      paddingBottom: m.body.paddingBottom,
      paddingHorizontal: s(10),
    },
    name: {
      height: m.body.nameLineHeight * m.body.nameLines,
      fontSize: s(14),
      lineHeight: m.body.nameLineHeight,
      fontWeight: "600" as const,
      color: colors.heading,
    },
    priceRow: {
      height: m.body.priceHeight,
      marginTop: m.body.nameToPrice,
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: s(6),
    },
    price: { fontSize: s(14), fontWeight: "700" as const, color: colors.teal },
    shared: { fontSize: s(11), color: colors.muted },
    actions: {
      height: actionHeight,
      marginTop: m.body.priceToActions,
      flexDirection: "row" as const,
      gap: s(6),
    },
    actionDanger: {
      ...action,
      backgroundColor: colors.danger + "18",
      borderColor: colors.danger + "45",
    },
    actionNeutral: {
      ...action,
      backgroundColor: colors.panel,
      borderColor: colors.border,
    },
    actionDisabled: { opacity: 0.45 },
    actionTextDanger: {
      fontSize: s(12),
      fontWeight: "600" as const,
      color: colors.danger,
    },
    actionTextNeutral: {
      fontSize: s(12),
      fontWeight: "600" as const,
      color: colors.heading,
    },
    cardRipple: { color: colors.teal + "22" },
    actionRipple: { color: colors.teal + "33" },
  };
}

type CardStyles = ReturnType<typeof buildCardStyles>;

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

interface ItemCardProps {
  item: MenuItemType;
  styles: CardStyles;
  /** Full editor available (this store owns the item). */
  editable: boolean;
  /** Visibility toggle allowed (owned, or global via per-location override). */
  availEditable: boolean;
  canSnooze: boolean;
  openContext?: ItemOpenContext;
  onPress: (item: MenuItemType, context?: ItemOpenContext) => void;
  onSnooze: (item: MenuItemType) => void;
  onToggleVisibility: (itemId: string) => void;
}

function ItemCardBase({
  item,
  styles,
  editable,
  availEditable,
  canSnooze,
  openContext,
  onPress,
  onSnooze,
  onToggleVisibility,
}: ItemCardProps) {
  const isVisible = item.availability !== false;
  const snoozeLabel = formatSnoozeCountdown(item.snoozedUntil);
  const isSnoozed = snoozeLabel !== null;
  const offPos = !isItemOnChannel(item, "pos");
  const orderable = isVisible && !isSnoozed && !offPos;

  let media: React.ReactNode;
  if (item.image) {
    media = (
      <MenuManagementImage
        image={item.image}
        recyclingKey={item.id}
        decodeSize={Math.max(160, Math.round(styles.card.width))}
        style={orderable ? styles.image : styles.imageDimmed}
      />
    );
  } else {
    const Placeholder = getItemPlaceholderIcon(item);
    media = (
      <View style={orderable ? undefined : styles.placeholderDimmed}>
        <Placeholder
          size={styles.placeholderSize}
          color={colors.muted}
          strokeWidth={1.75}
        />
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onPress(item, openContext)}
      android_ripple={styles.cardRipple}
      accessibilityRole="button"
      accessibilityLabel={
        editable ? `Edit ${item.name}` : `Price and availability for ${item.name}`
      }
      style={styles.card}
    >
      <View style={styles.imageBox}>
        {media}
        {(isSnoozed || !isVisible || offPos) && (
          <View style={styles.badges} pointerEvents="none">
            {isSnoozed && (
              <View style={styles.badgeDanger}>
                <Text style={styles.badgeText}>
                  {snoozeLabel === "86" ? "86'd" : `86'd · ${snoozeLabel}`}
                </Text>
              </View>
            )}
            {!isVisible && !isSnoozed && (
              <View style={styles.badgeNeutral}>
                <Text style={styles.badgeText}>Hidden</Text>
              </View>
            )}
            {offPos && (
              <View style={styles.badgeWarning}>
                <Text style={styles.badgeText}>Off on POS</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text numberOfLines={2} style={styles.name}>
          {item.name}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatCurrency(item.price)}</Text>
          {!editable && <Text style={styles.shared}>Shared</Text>}
        </View>
        <View style={styles.actions}>
          <Pressable
            onPress={() => onSnooze(item)}
            disabled={!canSnooze}
            android_ripple={styles.actionRipple}
            accessibilityRole="button"
            accessibilityLabel={
              isSnoozed ? `Restock ${item.name}` : `Mark ${item.name} out of stock`
            }
            style={[
              isSnoozed ? styles.actionNeutral : styles.actionDanger,
              !canSnooze && styles.actionDisabled,
            ]}
          >
            <Text style={isSnoozed ? styles.actionTextNeutral : styles.actionTextDanger}>
              {isSnoozed ? "Restock" : "86"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onToggleVisibility(item.id)}
            disabled={!availEditable}
            android_ripple={styles.actionRipple}
            accessibilityRole="button"
            accessibilityLabel={
              isVisible ? `Hide ${item.name} on the POS` : `Show ${item.name} on the POS`
            }
            style={[styles.actionNeutral, !availEditable && styles.actionDisabled]}
          >
            <Text style={styles.actionTextNeutral}>{isVisible ? "Hide" : "Show"}</Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

const sameChannels = (a?: string[], b?: string[]) =>
  a === b ||
  (Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((channel, i) => channel === b[i]));

/** Only the fields the card draws. */
const sameCardItem = (a: MenuItemType, b: MenuItemType) =>
  a === b ||
  (a.id === b.id &&
    a.name === b.name &&
    a.price === b.price &&
    a.image === b.image &&
    a.availability === b.availability &&
    a.snoozedUntil === b.snoozedUntil &&
    a.location_id === b.location_id &&
    a.placeholderIcon === b.placeholderIcon &&
    a.cardBgColor === b.cardBgColor &&
    sameChannels(a.availableChannels, b.availableChannels));

export const ItemCard = React.memo(
  ItemCardBase,
  (prev, next) =>
    sameCardItem(prev.item, next.item) &&
    prev.styles === next.styles &&
    prev.editable === next.editable &&
    prev.availEditable === next.availEditable &&
    prev.canSnooze === next.canSnooze &&
    prev.openContext === next.openContext &&
    prev.onPress === next.onPress &&
    prev.onSnooze === next.onSnooze &&
    prev.onToggleVisibility === next.onToggleVisibility,
);

// ---------------------------------------------------------------------------
// Grid
// ---------------------------------------------------------------------------

interface ItemGridProps {
  items: readonly MenuItemType[];
  /** A–Z letter headers (the full item library); off for a category's own order. */
  groupByLetter?: boolean;
  /** Scrolls with the grid, above the first row. */
  header?: React.ReactElement | null;
  empty?: React.ReactElement | null;
  /** Passed to the price sheet for category/menu-level price context. */
  openContext?: ItemOpenContext;
  initialScrollOffset?: number;
  onScrollOffsetChange?: (offset: number) => void;
}

function ItemGridBase({
  items,
  groupByLetter = false,
  header,
  empty,
  openContext,
  initialScrollOffset,
  onScrollOffsetChange,
}: ItemGridProps) {
  const s = useS();
  const { actions, canWrite, openItem, openSnooze } = useMenuManagement();
  const {
    isEntityEditable,
    canEditAvailabilityAndPrice,
    toggleItemAvailability,
    storeId,
  } = actions;
  const [width, setWidth] = useState(0);
  // The row to open at, and the column count it was computed for.
  const initialIndexRef = useRef<{ index: number; columns: number } | null>(null);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setWidth((prev) => (prev === next ? prev : next));
  }, []);

  const metrics = useMemo(() => computeItemGridMetrics(width, s), [width, s]);
  const styles = useMemo(() => buildCardStyles(metrics, s), [metrics, s]);
  const rowStyle = useMemo(() => [styles.row, { width }], [styles.row, width]);
  const headerStyle = useMemo(() => [styles.header, { width }], [styles.header, width]);

  const rows = useMemo(
    () => buildItemGridRows(items, metrics.columns, groupByLetter),
    [items, metrics.columns, groupByLetter],
  );

  const onSnooze = useCallback(
    (item: MenuItemType) =>
      openSnooze({ id: item.id, name: item.name, snoozedUntil: item.snoozedUntil }),
    [openSnooze],
  );

  const canSnooze = canWrite && !!storeId;

  const renderRow = useCallback(
    ({ item: row }: { item: ItemGridRow<MenuItemType> }) => {
      if (row.type === "header") {
        return (
          <View style={headerStyle}>
            <Text style={styles.headerText}>{row.letter}</Text>
          </View>
        );
      }
      return (
        <View style={rowStyle}>
          {row.items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              styles={styles}
              editable={isEntityEditable(item.location_id)}
              availEditable={canWrite && canEditAvailabilityAndPrice(item.location_id)}
              canSnooze={canSnooze}
              openContext={openContext}
              onPress={openItem}
              onSnooze={onSnooze}
              onToggleVisibility={toggleItemAvailability}
            />
          ))}
        </View>
      );
    },
    [
      headerStyle,
      rowStyle,
      styles,
      isEntityEditable,
      canWrite,
      canEditAvailabilityAndPrice,
      canSnooze,
      openContext,
      openItem,
      onSnooze,
      toggleItemAvailability,
    ],
  );

  const overrideItemLayout = useCallback(
    (layout: { size?: number }, row: ItemGridRow<MenuItemType>) => {
      layout.size = row.type === "header" ? metrics.headerHeight : metrics.rowHeight;
    },
    [metrics.headerHeight, metrics.rowHeight],
  );

  const getItemType = useCallback((row: ItemGridRow<MenuItemType>) => row.type, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      onScrollOffsetChange?.(event.nativeEvent.contentOffset.y);
    },
    [onScrollOffsetChange],
  );

  // Start the list AT the remembered row rather than scrolling there after
  // load: scrolling after the fact renders a screenful of cards at the top
  // first, only to throw them away. Row heights are exact, so the row that
  // contains the offset can be found by adding them up. Computed once, the
  // first time the grid has a width.
  if (initialIndexRef.current === null && width > 0) {
    let index = 0;
    const target = initialScrollOffset ?? 0;
    for (let y = 0; target > 0 && index < rows.length; index += 1) {
      const height =
        rows[index].type === "header" ? metrics.headerHeight : metrics.rowHeight;
      if (y + height > target) break;
      y += height;
    }
    initialIndexRef.current = {
      index: Math.min(index, Math.max(0, rows.length - 1)),
      columns: metrics.columns,
    };
  }

  const contentContainerStyle = useMemo(() => ({ paddingBottom: s(24) }), [s]);

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {width > 0 && (
        <FlashList
          // Column count is the structural input; keying on it gives each
          // layout a clean recycle pool. Filters and search only swap data.
          key={metrics.columns}
          data={rows}
          // Only for the layout it was computed for: a later column change
          // remounts the list and must not jump back to it.
          initialScrollIndex={
            initialIndexRef.current?.columns === metrics.columns &&
            initialIndexRef.current.index > 0
              ? initialIndexRef.current.index
              : undefined
          }
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          getItemType={getItemType}
          overrideItemLayout={overrideItemLayout}
          estimatedItemSize={metrics.rowHeight}
          // Two rows of run-up each way. More pre-mounts cards nobody sees yet,
          // which is exactly the work a low-end tablet can't spare mid-scroll.
          drawDistance={metrics.rowHeight * 2}
          ListHeaderComponent={header ?? null}
          ListEmptyComponent={empty ?? null}
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          onScroll={onScrollOffsetChange ? onScroll : undefined}
          scrollEventThrottle={100}
        />
      )}
    </View>
  );
}

export const ItemGrid = React.memo(ItemGridBase);
