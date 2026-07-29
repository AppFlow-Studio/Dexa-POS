import { useTableTimerTick } from "@/hooks/useTableTimerTick";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { isLocalOnlyStatus } from "@/lib/tableStateMachine";
import { colors, TABLE_STATUS_COLORS } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { WallEdgeFlags } from "@/lib/wallCornerSnap";
import { ensureOrderPrefetched } from "@/services/tableOrderPrefetch";
import {
    useOrderByAnyId,
    useOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
    compactTableName,
    DraggableTableProps,
    EMPTY_MERGED_TABLE_NAMES,
    getReservationTimeMs,
    MISSING_ORDER_SYNC_THROTTLE_MS,
    missingOrderLastAttemptAt,
    missingOrderSyncInFlight,
    pruneMissingOrderAttempts,
} from "./types";

/**
 * Shared, Reanimated-free derivation for both the static (view-mode) and the
 * editable (edit-mode) table cards. None of this allocates native shared
 * values — those are owned exclusively by the editable path. Keeping the data
 * derivation here means the static path on `/tables` (the common case, mounted
 * once per table per visit) pays zero per-table Reanimated cost.
 */
export const useTableCardData = (
  table: DraggableTableProps["table"],
  isTableType: boolean,
  isWall: boolean,
  wallEdgeFlags: WallEdgeFlags | undefined,
  shapeDef: (typeof TABLE_SHAPES)[keyof typeof TABLE_SHAPES] | undefined,
) => {
  const { isDarkColorScheme } = useColorScheme();
  const defaultSittingTimeMinutes = useLocationConfigStore((s) =>
    isTableType ? s.config.dining.defaultSittingTimeMinutes : 0,
  );

  // Subscribe directly to live session so table color/status updates without needing
  // the floor plan store sync (matches how Sidebar's TableListItem works).
  // Once isInitialized, the store is authoritative — don't fall back to the stale
  // table.session prop (TableLayoutView.memo blocks it from updating on session changes).
  const sessionStoreSession = useTableSessionStore((s) =>
    isTableType ? s.sessions[table.id] : undefined,
  );
  const sessionStoreInitialized = useTableSessionStore((s) => s.isInitialized);
  const liveSession = sessionStoreInitialized
    ? sessionStoreSession
    : (sessionStoreSession ?? table.session);

  const resolvedWallEdgeFlags: WallEdgeFlags = wallEdgeFlags ?? {
    hideTop: false,
    hideRight: false,
    hideBottom: false,
    hideLeft: false,
  };

  const tick = useTableTimerTick(isTableType);

  // Memoize effective dimensions so downstream useMemo (textFit, etc.) deps
  // stay referentially stable across renders where width/height haven't changed.
  const effectiveWidth = useMemo(
    () => table.width ?? shapeDef?.width ?? 100,
    [table.width, shapeDef?.width],
  );
  const effectiveHeight = useMemo(
    () => table.height ?? shapeDef?.height ?? 100,
    [table.height, shapeDef?.height],
  );

  const effectiveOrder =
    useOrderByAnyId(isTableType ? liveSession?.order_id : null) ?? undefined;

  // Fallback fetch when the batched prefetch in services/tableOrderPrefetch.ts
  // missed an order (e.g. transient network error, or the order_id appeared
  // after the subscriber's last fire). Throttled per-orderId.
  useEffect(() => {
    const id = liveSession?.order_id;
    if (!id || effectiveOrder) return;

    const now = Date.now();
    const lastAttempt = missingOrderLastAttemptAt[id] ?? 0;
    if (missingOrderSyncInFlight.has(id)) return;
    if (now - lastAttempt < MISSING_ORDER_SYNC_THROTTLE_MS) return;

    missingOrderLastAttemptAt[id] = now;
    missingOrderSyncInFlight.add(id);
    // Opportunistic prune: on each write, evict entries older than 5 min
    pruneMissingOrderAttempts();

    ensureOrderPrefetched(id)
      .catch((err: unknown) => {
        console.warn(
          "[DraggableTable] Failed to sync missing order for table card:",
          { tableId: table.id, orderId: id, error: err },
        );
      })
      .finally(() => {
        missingOrderSyncInFlight.delete(id);
      });
  }, [liveSession?.order_id, effectiveOrder, table.id]);

  const openedAt = effectiveOrder?.opened_at ?? null;
  const liveSessionStatus = liveSession?.status ?? null;

  const { duration, isOvertime } = useMemo(() => {
    const status = liveSessionStatus?.toLowerCase();
    const isInUse =
      status === "seating" ||
      status === "seated" ||
      status === "ordering" ||
      status === "ordered" ||
      status === "served" ||
      status === "check_presented" ||
      status === "paying" ||
      status === "paid" ||
      status === "closing" ||
      !!openedAt;

    if (!isInUse || !openedAt) {
      return { duration: "", isOvertime: false };
    }

    const startTime = new Date(openedAt).getTime();
    const diffMins = Math.floor((Date.now() - startTime) / 60000);

    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const durationStr = hours > 0 ? `${hours}hr ${mins}m` : `${mins}m`;

    return {
      duration: durationStr,
      isOvertime:
        defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes,
    };
    // tick drives the 60s refresh; openedAt/liveSessionStatus are primitive deps
    // so this only recomputes when data actually changes OR the minute ticks
  }, [tick, liveSessionStatus, openedAt, defaultSittingTimeMinutes]);

  const serverInitials = useMemo(() => {
    const staffId = liveSession?.server_staff_id;
    if (!staffId) return null;
    const emp = useEmployeeStore.getState().getEmployeeByStaffId(staffId);
    if (!emp?.fullName) return null;
    const parts = emp.fullName.trim().split(" ");
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }, [liveSession?.server_staff_id]);

  const activeTabAmount = useMemo(() => {
    const payments = effectiveOrder?.payments;
    if (!payments) return null;
    const preAuth = payments.find(
      (p: any) => p.status === "authorized" && p.isPreAuth && !p.isVoided,
    );
    return preAuth?.preAuthAmount ?? null;
  }, [effectiveOrder?.payments]);

  // O(1) lookup from precomputed map — no per-table filter/sort on every reservation poll
  const liveNextReservation = useReservationStore((s) =>
    isTableType ? (s.nextReservationByTableId[table.id] ?? null) : null,
  );

  // Subscribe only to the specific merged table names needed, not the entire tablesById map
  const mergedTableIds: string[] = liveSession?.merged_tables ?? [];
  const mergedTableNames = useFloorPlanStore(
    useShallow((s) =>
      isTableType
        ? mergedTableIds
            .filter((id: string) => id !== table.id)
            .map((id: string) => s.tablesById[id]?.name ?? null)
        : EMPTY_MERGED_TABLE_NAMES,
    ),
  );

  const displayName = useMemo(() => {
    if (mergedTableIds.length > 0) {
      const otherTableNames = mergedTableNames.filter(Boolean).join(", ");
      if (otherTableNames) return `${table.name} (Merged: ${otherTableNames})`;
    }
    return table.name;
  }, [table.name, mergedTableNames, mergedTableIds.length]);

  const orderTotals = useOrderTotals(
    isTableType ? (effectiveOrder?.id ?? null) : null,
  );
  const orderTotal = orderTotals?.total ?? 0;

  const {
    reservationCountdownLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent,
  } = useMemo(() => {
    const nextReservation = liveNextReservation
      ? {
          date: liveNextReservation.reservation_date,
          time: liveNextReservation.reservation_time,
        }
      : null;

    if (!nextReservation)
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false,
      };

    const reservationTimeMs = getReservationTimeMs(nextReservation);
    if (reservationTimeMs == null || !Number.isFinite(reservationTimeMs))
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false,
      };

    const diffMs = reservationTimeMs - Date.now();
    if (diffMs <= 0 || diffMs > 30 * 60 * 1000)
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false,
      };

    const minutesLeft = Math.max(1, Math.ceil(diffMs / 60000));
    const label = liveSession
      ? `Res in ${minutesLeft}m`
      : `Reserved in ${minutesLeft}m`;
    const occupied = !!liveSession;
    const urgent = minutesLeft < 10;

    return {
      reservationCountdownLabel: label,
      isReservedSoon: !occupied,
      isOccupiedWithReservationSoon: occupied,
      isReservationUrgent: urgent,
    };
  }, [tick, liveSession, liveNextReservation]);

  // Determine table color status from DB-synced session status only (skip local-only intermediates)
  const sessionStatus = liveSession?.status;
  const tableStatus =
    (sessionStatus && !isLocalOnlyStatus(sessionStatus)
      ? sessionStatus
      : null) ||
    (table.is_active === false && "not_in_service") ||
    "available";

  const tableColor = isOvertime
    ? TABLE_STATUS_COLORS.Overtime
    : isReservedSoon
      ? colors.info
      : TABLE_STATUS_COLORS[tableStatus] || TABLE_STATUS_COLORS.available;

  const textFit = useMemo(() => {
    const shapeId = table.shape_id?.toLowerCase() ?? "";
    const isCircleShape =
      shapeId.includes("circle") || shapeId.includes("high-top");
    const isBoothShape =
      shapeId.includes("booth") || table.category === "booth";
    const minDim = Math.min(effectiveWidth, effectiveHeight);
    const usableFactor = isCircleShape ? 0.76 : isBoothShape ? 0.84 : 1;
    const usableMinDim = minDim * usableFactor;
    const primary = Math.max(7, Math.min(12, Math.round(usableMinDim * 0.12)));
    const secondary = Math.max(
      6,
      Math.min(8, Math.round(usableMinDim * 0.085)),
    );
    const amount = Math.max(7, Math.min(11, Math.round(usableMinDim * 0.11)));
    const compactMeta = usableMinDim < 76;
    const ultraCompact = usableMinDim < 62;
    const contentWidth = Math.round(
      effectiveWidth * (isCircleShape ? 0.58 : isBoothShape ? 0.72 : 0.82),
    );
    const contentHeight = Math.round(
      effectiveHeight * (isCircleShape ? 0.5 : isBoothShape ? 0.64 : 0.72),
    );
    const showSecondaryMeta =
      !ultraCompact && (!isCircleShape || usableMinDim >= 92);
    return {
      minDim,
      usableMinDim,
      isCircleShape,
      primary,
      secondary,
      amount,
      compactMeta,
      ultraCompact,
      contentWidth,
      contentHeight,
      showSecondaryMeta,
      maxLabelChars:
        usableMinDim < 62
          ? 6
          : usableMinDim < 78
            ? 9
            : usableMinDim < 95
              ? 13
              : usableMinDim < 115
                ? 18
                : 28,
    };
  }, [effectiveWidth, effectiveHeight, table.shape_id, table.category]);

  const tableLabel = useMemo(() => {
    const raw = (displayName || table.name || "").trim();
    if (!raw) return table.name;
    if (textFit.ultraCompact) return compactTableName(raw);
    if (raw.length <= textFit.maxLabelChars) return raw;
    const clipped = raw.slice(0, Math.max(6, textFit.maxLabelChars - 1)).trim();
    return `${clipped}...`;
  }, [displayName, table.name, textFit.maxLabelChars, textFit.ultraCompact]);

  const reservationLabel = useMemo(() => {
    if (!reservationCountdownLabel) return null;
    const mins = reservationCountdownLabel.match(/(\d+)m/)?.[1];
    if (textFit.compactMeta || isOccupiedWithReservationSoon) {
      return mins ? `R ${mins}m` : "R";
    }
    return reservationCountdownLabel;
  }, [
    reservationCountdownLabel,
    textFit.compactMeta,
    isOccupiedWithReservationSoon,
  ]);

  const isOccupiedStatus =
    tableStatus === "seating" ||
    tableStatus === "seated" ||
    tableStatus === "ordering" ||
    tableStatus === "ordered" ||
    tableStatus === "served" ||
    tableStatus === "check_presented" ||
    tableStatus === "paying" ||
    tableStatus === "paid";

  const occupiedMetaLabel = useMemo(() => {
    const partySize = liveSession?.party_size;
    const hasDuration = !!duration;
    const partyLong =
      partySize != null
        ? `${partySize} ${partySize === 1 ? "guest" : "guests"}`
        : "";
    const partyShort = partySize != null ? `${partySize}g` : "";

    const party = textFit.showSecondaryMeta ? partyLong : partyShort;

    if (hasDuration && party) return `${duration} · ${party}`;
    if (hasDuration) return duration;
    if (party) return party;
    return "";
  }, [duration, liveSession?.party_size, textFit.showSecondaryMeta]);

  const newAttention = liveSession?.needs_attention ?? false;

  return {
    isDarkColorScheme,
    liveSession,
    resolvedWallEdgeFlags,
    effectiveWidth,
    effectiveHeight,
    effectiveOrder,
    serverInitials,
    activeTabAmount,
    tableColor,
    tableStatus,
    textFit,
    tableLabel,
    reservationLabel,
    reservationCountdownLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent,
    isOccupiedStatus,
    occupiedMetaLabel,
    orderTotal,
    newAttention,
  };
};

export type TableCardData = ReturnType<typeof useTableCardData>;
