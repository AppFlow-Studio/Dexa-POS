import { OrderProfile } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Encapsulates all coursing logic for a table order:
 * - Server initialization + loading
 * - New item -> course assignment
 * - DB item sync with course status guards
 */
export function useTableCoursing(activeOrder: OrderProfile | undefined) {
  const orderId = activeOrder?.id;

  // Granular selectors: only subscribe to this order's data, not the entire store
  const orderCoursing = useCoursingStore(
    (s) => s.byOrderId[orderId || ""],
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

  const itemIds = useMemo(
    () => activeOrder?.items?.map((i) => i.id).join(",") ?? "",
    [activeOrder?.items],
  );

  const dbItemIdsHash = useMemo(
    () =>
      activeOrder?.items
        ?.map((i) => i.db_order_item_id)
        .filter(Boolean)
        .join(",") ?? "",
    [activeOrder?.items],
  );

  useEffect(() => {
    if (!orderId) {
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
  }, [orderId, activeOrder?.db_order_id]);

  useEffect(() => {
    if (!orderId || !coursingInitialized) return;

    const currentIds = itemIds.split(",").filter(Boolean);
    const prevIds = prevItemIdsRef.current;
    const prevSet = new Set(prevIds);

    if (prevIds.length === 0) {
      const state = getForOrder(orderId);
      currentIds.forEach((id) => {
        if (state?.itemCourseMap?.[id] !== undefined) return;
        const item = activeOrder?.items?.find((i) => i.id === id);
        if (!item) return;
        const dbCourse = item.db_order_item_id
          ? state?.dbIdToCourseMap?.[item.db_order_item_id]
          : undefined;
        const course = dbCourse
          ?? (item.courseNumber && item.courseNumber > 0 ? item.courseNumber : undefined)
          ?? (state?.workingCourse ?? 1);
        setItemCourse(orderId, id, course, item.db_order_item_id, true);
      });
      prevItemIdsRef.current = currentIds;
      return;
    }

    const newIds = currentIds.filter((id) => !prevSet.has(id));
    if (newIds.length > 0) {
      const state = getForOrder(orderId);
      const useCourse = state?.workingCourse ?? 1;
      newIds.forEach((id) => {
        const item = activeOrder?.items?.find((i) => i.id === id);
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
    prevItemIdsRef.current = currentIds;
  }, [orderId, itemIds, coursingInitialized, activeOrder?.items]);

  useEffect(() => {
    if (!orderId || !activeOrder?.items || !coursingInitialized) return;

    activeOrder.items.forEach((item) => {
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
        if (courseStatus && courseStatus !== "open") {
          setItemCourse(
            orderId,
            item.id,
            course,
            item.db_order_item_id,
            true,
          );
          syncedDbItemsRef.current.add(item.db_order_item_id);
          return;
        }

        setItemCourse(
          orderId,
          item.id,
          course,
          item.db_order_item_id,
          false,
        );
        syncedDbItemsRef.current.add(item.db_order_item_id);
      }
    });
  }, [orderId, dbItemIdsHash, coursingInitialized]);

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

  const itemCourseMap = orderCoursing?.itemCourseMap;

  return {
    currentCourse,
    sentCourses,
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
