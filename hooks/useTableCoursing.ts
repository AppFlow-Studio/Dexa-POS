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
  const coursing = useCoursingStore();
  const orderId = activeOrder?.id;
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

  // Initialize coursing and load from server
  useEffect(() => {
    if (!orderId) {
      setCoursingInitialized(false);
      return;
    }

    coursing.initializeForOrder(orderId, activeOrder?.db_order_id);

    // Gate on db_order_id — no point fetching from server before order is synced
    if (!activeOrder?.db_order_id) {
      setCoursingInitialized(true);
      return;
    }

    coursing
      .loadFromServer(orderId)
      .then(() => setCoursingInitialized(true))
      .catch((error) => {
        console.error("[Coursing] Failed to load from server:", error);
        setCoursingInitialized(true);
      });

    return () => {
      setCoursingInitialized(false);
    };
  }, [orderId, activeOrder?.db_order_id]);

  // Assign new items to working course
  useEffect(() => {
    if (!orderId || !coursingInitialized) return;

    const currentIds = itemIds.split(",").filter(Boolean);
    const prevIds = prevItemIdsRef.current;

    if (prevIds.length === 0) {
      // Populate itemCourseMap for pre-existing items
      const state = coursing.getForOrder(orderId);
      currentIds.forEach((id) => {
        if (state?.itemCourseMap?.[id] !== undefined) return; // already assigned
        const item = activeOrder?.items?.find((i) => i.id === id);
        if (!item) return;
        const dbCourse = item.db_order_item_id
          ? state?.dbIdToCourseMap?.[item.db_order_item_id]
          : undefined;
        const course = dbCourse
          ?? (item.courseNumber && item.courseNumber > 0 ? item.courseNumber : undefined)
          ?? (state?.workingCourse ?? 1);
        coursing.setItemCourse(orderId, id, course, item.db_order_item_id, true);
      });
      prevItemIdsRef.current = currentIds;
      return;
    }

    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    if (newIds.length > 0) {
      const state = coursing.getForOrder(orderId);
      const useCourse = state?.workingCourse ?? 1;
      newIds.forEach((id) => {
        const item = activeOrder?.items?.find((i) => i.id === id);
        // Check dbIdToCourseMap first — most reliable for re-keyed items after backend sync
        const dbCourse = item?.db_order_item_id
          ? state?.dbIdToCourseMap?.[item.db_order_item_id]
          : undefined;

        if (dbCourse !== undefined) {
          // Re-keyed item: preserve existing course from dbIdToCourseMap
          coursing.setItemCourse(orderId, id, dbCourse, item?.db_order_item_id, true);
        } else if (item?.courseNumber !== undefined && item.courseNumber > 0) {
          coursing.setItemCourse(
            orderId,
            id,
            item.courseNumber,
            item?.db_order_item_id,
            true,
          );
        } else if (state?.itemCourseMap?.[id] === undefined) {
          coursing.setItemCourse(
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

  // Sync items to backend once they have a DB ID
  useEffect(() => {
    if (!orderId || !activeOrder?.items || !coursingInitialized) return;

    activeOrder.items.forEach((item) => {
      if (
        item.db_order_item_id &&
        !syncedDbItemsRef.current.has(item.db_order_item_id)
      ) {
        const state = coursing.getForOrder(orderId);

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
          coursing.setItemCourse(
            orderId,
            item.id,
            course,
            item.db_order_item_id,
            true,
          );
          syncedDbItemsRef.current.add(item.db_order_item_id);
          return;
        }

        coursing.setItemCourse(
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

  // Derived values
  const currentCourse =
    coursing.byOrderId[orderId || ""]?.workingCourse ?? 1;

  const sentCourses = useMemo(() => {
    const courseData = coursing.getForOrder(orderId || "");
    const sentMap: Record<number, boolean> = {};
    if (courseData?.courses) {
      Object.entries(courseData.courses).forEach(([num, info]) => {
        sentMap[Number(num)] = info.status !== "open";
      });
    }
    return sentMap;
  }, [orderId, coursing.byOrderId[orderId || ""]?.courses]);

  const itemCourseMap = coursing.getForOrder(orderId || "")?.itemCourseMap;

  return {
    coursing,
    currentCourse,
    sentCourses,
    itemCourseMap,
    coursingInitialized,
    setCurrentCourse: coursing.setCurrentCourse,
    isCourseSent: coursing.isCourseSent,
    markCourseSent: coursing.markCourseSent,
    markCourseServed: coursing.markCourseServed,
    getForOrder: coursing.getForOrder,
    finalizeCurrentCourse: coursing.finalizeCurrentCourse,
    setItemCourse: coursing.setItemCourse,
  };
}
