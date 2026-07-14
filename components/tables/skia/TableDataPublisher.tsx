import React, { useEffect, useMemo } from "react";

import { useTableCardData } from "@/components/tables/cards/useTableCardData";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { colors } from "@/lib/theme";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import {
  TableBadge,
  TableDrawData,
  TableTextLine,
  useTableDrawStore,
} from "./tableDrawStore";

/**
 * Runs `useTableCardData` in the normal RN tree (NOT inside the Skia Canvas, where
 * hooks/stores/context don't propagate) and publishes the resolved, plain draw-data
 * to `useTableDrawStore` for SkiaTableLayer to draw. Renders nothing.
 *
 * This is the required "prepare data outside the Canvas" pattern for react-native-skia
 * (see tableDrawStore.ts).
 */

const TableDataPublisher: React.FC<{ table: FloorPlanObject }> = ({
  table,
}) => {
  const shapeDef = TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES];
  const data = useTableCardData(table, true, false, undefined, shapeDef);

  const setData = useTableDrawStore((s) => s.setData);

  const {
    isDarkColorScheme,
    liveSession,
    effectiveWidth,
    effectiveHeight,
    effectiveOrder,
    serverInitials,
    activeTabAmount,
    tableColor,
    newAttention,
    tableStatus,
    textFit,
    tableLabel,
    reservationLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent,
    isOccupiedStatus,
    occupiedMetaLabel,
    orderTotal,
    reservationCountdownLabel,
  } = data;

  // Build the text lines + badges (moved here from the old Skia-side component so it
  // runs where the hooks/data actually live).
  const draw = useMemo<TableDrawData>(() => {
    const lines: TableTextLine[] = [];
    const labelColor = isDarkColorScheme ? tableColor : "#111827";
    const metaColorDark = tableColor + "AA";
    const metaColor = isDarkColorScheme ? tableColor + "AA" : "#334155";

    if (tableLabel) {
      lines.push({
        text: tableLabel,
        size: textFit.primary,
        weight: "700",
        color: labelColor,
      });
    }

    if (
      textFit.showSecondaryMeta &&
      !textFit.compactMeta &&
      tableStatus === "available" &&
      !isReservedSoon
    ) {
      const seats =
        table.capacity ||
        TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]?.capacity ||
        0;
      lines.push({
        text: `${seats} SEATS`,
        size: textFit.secondary,
        weight: "600",
        color: metaColorDark,
      });
    }

    if (reservationLabel && !isOccupiedWithReservationSoon) {
      lines.push({
        text: reservationLabel,
        size: textFit.secondary,
        weight: "600",
        color: tableColor + "CC",
      });
    }

    if (isOccupiedStatus) {
      if (!effectiveOrder && liveSession?.order_id) {
        if (occupiedMetaLabel && !textFit.ultraCompact) {
          lines.push({
            text: occupiedMetaLabel,
            size: textFit.secondary,
            weight: "600",
            color: metaColor,
          });
        }
      } else {
        lines.push({
          text: `$${orderTotal.toFixed(2)}`,
          size: textFit.amount,
          weight: "700",
          color: isDarkColorScheme ? "#FFFFFF" : "#111827",
        });
        if (occupiedMetaLabel && !textFit.ultraCompact) {
          lines.push({
            text: occupiedMetaLabel,
            size: textFit.secondary,
            weight: "600",
            color: metaColor,
          });
        }
      }
    }

    const badges: TableBadge[] = [];
    if (serverInitials) {
      badges.push({
        kind: "server",
        text: serverInitials,
        bg: isDarkColorScheme ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.9)",
        border: tableColor + "99",
        fg: isDarkColorScheme ? tableColor : "#111827",
      });
    }
    if (isReservedSoon || isOccupiedWithReservationSoon) {
      const mins = reservationCountdownLabel?.match(/(\d+)m/)?.[1];
      const label = mins ? `R ${mins}m` : "R";
      const badgeColor = isReservationUrgent ? colors.danger : colors.warning;
      badges.push({
        kind: "reservation",
        text: label,
        bg: badgeColor + "40",
        border: badgeColor,
        fg: badgeColor,
      });
    }
    if (activeTabAmount != null) {
      badges.push({
        kind: "tab",
        text: `TAB $${activeTabAmount.toFixed(0)}`,
        bg: "rgba(0,0,0,0.7)",
        border: colors.teal + "99",
        fg: colors.teal,
      });
    }

    return {
      shapeId: table.shape_id,
      x: table.x,
      y: table.y,
      rotation: table.rotation || 0,
      width: effectiveWidth,
      height: effectiveHeight,
      color: tableColor,
      darkMode: isDarkColorScheme,
      attention: newAttention,
      lines,
      badges,
    };
  }, [
    table.shape_id,
    table.x,
    table.y,
    table.rotation,
    table.capacity,
    effectiveWidth,
    effectiveHeight,
    tableColor,
    isDarkColorScheme,
    newAttention,
    tableStatus,
    textFit,
    tableLabel,
    reservationLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent,
    isOccupiedStatus,
    occupiedMetaLabel,
    orderTotal,
    reservationCountdownLabel,
    serverInitials,
    activeTabAmount,
    effectiveOrder,
    liveSession?.order_id,
  ]);

  useEffect(() => {
    setData(table.id, draw);
  }, [table.id, draw, setData]);

  // NOTE: we intentionally do NOT call clearData on unmount. Clearing data on
  // unmount creates a gap between the SkiaTableLayer receiving new tables (from a
  // viewport change) and the new TableDataPublisher instance publishing its data
  // (which happens in a useEffect, i.e. after paint). During that gap the Canvas
  // sees no draw-data for the table and skips it, causing a visible blink/flicker.
  // Keeping stale data is harmless — it's a small plain object, and the Canvas
  // only draws it when the table is in the `tables` prop anyway.

  return null;
};

export default React.memo(TableDataPublisher);
