import { CartItem, OrderProfile } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Encapsulates all coursing logic for a table order:
 * - Server initialization + loading
 * - New item -> course assignment
 * - DB item sync with course status guards
 */
export function useTableCoursing(activeOrder: OrderProfile | undefined, enabled = true) {
  const orderId = activeOrder?.id;

  // Granular selectors: short-circuit when disabled to skip subscription overhead
  const orderCoursing = useCoursingStore(
    (s) => enabled ? s.byOrderId[orderId || ""] : undefined,
  );
  const initializeForOrder = useCoursingStore((s) => s.initializeForOrder);
  const loadFromServer = useCoursingStore((s) => s.loadFromServer);
  const getForOrder = useCoursingStore((s) => s.getForOrder);
  const setItemCourse = useCoursingStore((s) => s.setItemCourse);
  const setCurrentCourse = useCoursingStore((s) => s.setCurrentCourse);
  const isCourseSent = useCoursingStore((s) => s.isCourseSent);
  const markCourseSent = useCoursingStore((s) => s.markCourseSent);
  const unmarkCourseSent = useCoursingStore((s) => s.unmarkCourseSent);
  const markCourseServed = useCoursingStore((s) => s.markCourseServed);
  const finalizeCurrentCourse = useCoursingStore((s) => s.finalizeCurrentCourse);

  const [coursingInitialized, setCoursingInitialized] = useState(false);
  const prevItemIdsRef = useRef<string[]>([]);
  const syncedDbItemsRef = useRef<Set<string>>(new Set());

  // Derive stable strings directly — avoids re-running when items array reference
  // changes due to immer mutations that don't affect IDs (e.g. kitchen_status updates)
  const itemIds = activeOrder?.items?.map((i) => i.id).join(",") ?? "";
  const dbItemIdsHash =
    activeOrder?.items?.map((i) => i.db_order_item_id).filter(Boolean).join(",") ?? "";

  useEffect(() => {
    if (!enabled || !orderId) {
      setCoursingInitialized(false);
      return;
    }

    // Reset tracking refs when order changes
    syncedDbItemsRef.current = new Set();
    prevItemIdsRef.current = [];

    initializeForOrder(orderId, activeOrder?.db_order_id);

    if (!activeOrder?.db_order_id) {
      setCoursingInitialized(true);
      return;
    }

    loadFromServer(orderId)
      .then(() => setCoursingInitialized(true))
      .catch((error) => {
        console.error("[Coursing] Failed to load from server:", error);
        setCoursingInitialized(true);
      });

    return () => {
      setCoursingInitialized(false);
    };
  }, [enabled, orderId, activeOrder?.db_order_id]);

  // Merged effect: new-item detection + DB-item sync in one pass
  // (was two separate effects iterating activeOrder.items — now one)
  useEffect(() => {
    if (!enabled || !orderId || !coursingInitialized) return;

    // Build O(1) lookup map — avoids O(n²) .find() inside loops
    const itemMap = new Map<string, CartItem>();
    if (activeOrder?.items) {
      for (const item of activeOrder.items) {
        itemMap.set(item.id, item);
      }
    }

    const currentIds = itemIds.split(",").filter(Boolean);
    const prevIds = prevItemIdsRef.current;
    const prevSet = new Set(prevIds);

    // --- Part 1: New item detection ---
    if (prevIds.length === 0) {
      const state = getForOrder(orderId);
      currentIds.forEach((id) => {
        if (id.startsWith('draft_')) return;
        if (state?.itemCourseMap?.[id] !== undefined) return;
        const item = itemMap.get(id);
        if (!item) return;
        const dbCourse = item.db_order_item_id
          ? state?.dbIdToCourseMap?.[item.db_order_item_id]
          : undefined;
        const course = dbCourse
          ?? (item.courseNumber && item.courseNumber > 0 ? item.courseNumber : undefined)
          ?? (state?.workingCourse ?? 1);
        setItemCourse(orderId, id, course, item.db_order_item_id, true);
      });
    } else {
      const newIds = currentIds.filter((id) => !prevSet.has(id) && !id.startsWith('draft_'));
      if (newIds.length > 0) {
        const state = getForOrder(orderId);
        const useCourse = state?.workingCourse ?? 1;
        newIds.forEach((id) => {
          const item = itemMap.get(id);
          const dbCourse = item?.db_order_item_id
            ? state?.dbIdToCourseMap?.[item.db_order_item_id]
            : undefined;

          if (dbCourse !== undefined) {
            setItemCourse(orderId, id, dbCourse, item?.db_order_item_id, true);
          } else if (item?.courseNumber !== undefined && item.courseNumber > 0) {
            setItemCourse(
              orderId,
              id,
              item.courseNumber,
              item?.db_order_item_id,
              true,
            );
          } else if (state?.itemCourseMap?.[id] === undefined) {
            setItemCourse(
              orderId,
              id,
              useCourse,
              item?.db_order_item_id,
            );
          }
        });
      }
    }
    prevItemIdsRef.current = currentIds;

    // --- Part 2: DB item sync (items that received db_order_item_id) ---
    if (activeOrder?.items) {
      activeOrder.items.forEach((item) => {
        if (item.isDraft) return;
        if (
          item.db_order_item_id &&
          !syncedDbItemsRef.current.has(item.db_order_item_id)
        ) {
          const state = getForOrder(orderId);

          let course: number;
          if (item.courseNumber !== undefined && item.courseNumber > 0) {
            course = item.courseNumber;
          } else if (
            state?.dbIdToCourseMap?.[item.db_order_item_id] !== undefined
          ) {
            course = state.dbIdToCourseMap[item.db_order_item_id];
          } else if (state?.itemCourseMap?.[item.id] !== undefined) {
            course = state.itemCourseMap[item.id];
          } else {
            course = state?.workingCourse ?? 1;
          }

          const courseStatus = state?.courses?.[course]?.status;
          setItemCourse(
            orderId,
            item.id,
            course,
            item.db_order_item_id,
            !!(courseStatus && courseStatus !== "open"),
          );
          syncedDbItemsRef.current.add(item.db_order_item_id);
        }
      });
    }
  // activeOrder?.items intentionally omitted — itemIds and dbItemIdsHash capture
  // the only item properties this effect cares about (IDs). Including the full
  // items array causes the effect to re-run on every kitchen_status / quantity
  // mutation, which is wasteful and causes O(n²) behavior on large orders.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, itemIds, dbItemIdsHash, coursingInitialized]);

  const currentCourse = orderCoursing?.workingCourse ?? 1;

  const sentCourses = useMemo(() => {
    const sentMap: Record<number, boolean> = {};
    if (orderCoursing?.courses) {
      Object.entries(orderCoursing.courses).forEach(([num, info]) => {
        sentMap[Number(num)] = info.status !== "open";
      });
    }
    return sentMap;
  }, [orderCoursing?.courses]);

  // Persistent sent timestamps from the coursing store (survives navigation)
  const courseSentAtMap = useMemo(() => {
    const map: Record<number, number> = {};
    if (orderCoursing?.courses) {
      Object.entries(orderCoursing.courses).forEach(([num, info]) => {
        if (info.firedAt) {
          map[Number(num)] = new Date(info.firedAt).getTime();
        }
      });
    }
    return map;
  }, [orderCoursing?.courses]);

  const itemCourseMap = orderCoursing?.itemCourseMap;

  return {
    currentCourse,
    sentCourses,
    courseSentAtMap,
    itemCourseMap,
    coursingInitialized,
    setCurrentCourse,
    isCourseSent,
    markCourseSent,
    unmarkCourseSent,
    markCourseServed,
    getForOrder,
    finalizeCurrentCourse,
    setItemCourse,
  };
}
