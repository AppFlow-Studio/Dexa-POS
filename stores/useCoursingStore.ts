import {
  isLocalId,
  resolveToBackendId,
} from "@/lib/offlineIdRegistry";
import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import { useOrderStore } from "@/stores/useOrderStore";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

// ============================================================================
// SUPABASE CLIENT (Global pattern like useOrderStore)
// ============================================================================

let _supabaseClient: SupabaseClient | null = null;

export function setCoursingSupabaseClient(client: SupabaseClient | null) {
  _supabaseClient = client;
}

// Helper to validate if a string is a valid UUID (for backend sync)
const isValidUUID = (id: string): boolean => {
  // UUID v4 regex pattern
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// ============================================================================
// TYPES
// ============================================================================

export type CourseStatus =
  | "open"
  | "fired"
  | "in_progress"
  | "served"
  | "completed";

export interface CourseInfo {
  courseNumber: number;
  status: CourseStatus;
  firedAt?: string;
  servedAt?: string;
  itemCount: number;
  items?: Array<{
    id: string;
    item_name: string;
    quantity: number;
    subtotal: number;
  }>;
}

type OrderCoursing = {
  workingCourse: number;
  itemCourseMap: Record<string, number>; // Maps both local IDs and DB IDs to course numbers
  dbIdToCourseMap: Record<string, number>; // Maps DB item IDs specifically for backend sync
  courses: Record<number, CourseInfo>;
  syncing: boolean;
  lastSyncAt?: Date;
  dbOrderId?: string; // The database UUID for RPC calls
};

type CoursingState = {
  byOrderId: Record<string, OrderCoursing>;

  // Initialization
  initializeForOrder: (orderId: string, dbOrderId?: string) => void;
  setDbOrderId: (orderId: string, dbOrderId: string) => void;
  loadFromServer: (orderId: string) => Promise<void>;

  // Getters
  getForOrder: (orderId: string) => OrderCoursing | undefined;
  getWorkingCourse: (orderId: string) => number;
  getCourseStatus: (orderId: string, courseNumber: number) => CourseStatus;
  isCourseOpen: (orderId: string, courseNumber: number) => boolean;
  isCourseFired: (orderId: string, courseNumber: number) => boolean;
  getOpenCourses: (orderId: string) => number[];
  getFiredCourses: (orderId: string) => number[];
  getItemCourse: (orderId: string, itemId: string, dbItemId?: string) => number;
  getItemCourseByDbId: (orderId: string, dbItemId: string) => number | undefined;
  canModifyItem: (orderId: string, itemId: string) => boolean;

  // Backward compatibility
  setCurrentCourse: (orderId: string, course: number) => void;
  isCourseSent: (orderId: string, course: number) => boolean;
  getSentCourses: (orderId: string) => number[];
  getUnsentCourses: (orderId: string) => number[];
  markCourseSent: (orderId: string, course: number) => void;
  getAllCourseStatuses: (
    orderId: string
  ) => Record<number, "unsent" | "sent" | "in_progress">;

  // Local actions
  setWorkingCourse: (orderId: string, courseNumber: number) => void;
  setItemCourse: (
    orderId: string,
    itemId: string,
    courseNumber: number,
    dbItemId?: string // Optional: DB UUID for syncing
  ) => void;
  assignItemsToWorkingCourse: (orderId: string, itemIds: string[]) => void;
  finalizeCurrentCourse: (orderId: string, itemIds: string[]) => number;

  // Server synced
  createNextCourse: (orderId: string) => Promise<number>;
  fireCourse: (orderId: string, courseNumber: number) => Promise<void>;
  markCourseServed: (orderId: string, courseNumber: number) => Promise<void>;

  // Cleanup
  clearOrder: (orderId: string) => void;
};

// ============================================================================
// STORE
// ============================================================================

export const useCoursingStore = create<CoursingState>((set, get) => ({
  byOrderId: {},

  // ========================================================================
  // INITIALIZATION
  // ========================================================================

  initializeForOrder: (orderId: string, dbOrderId?: string) => {
    const state = get();
    if (state.byOrderId[orderId]) {
      // Update dbOrderId if we now have it
      if (dbOrderId && !state.byOrderId[orderId].dbOrderId) {
        set((prev) => ({
          byOrderId: {
            ...prev.byOrderId,
            [orderId]: { ...prev.byOrderId[orderId], dbOrderId },
          },
        }));
      }
      return;
    }

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          workingCourse: 1,
          itemCourseMap: {},
          dbIdToCourseMap: {}, // Initialize the DB ID map
          courses: { 1: { courseNumber: 1, status: "open", itemCount: 0 } },
          syncing: false,
          dbOrderId,
        },
      },
    }));

    // Load from server if we have dbOrderId
    if (_supabaseClient && dbOrderId) {
      get().loadFromServer(orderId).catch(console.error);
    }
  },

  setDbOrderId: (orderId: string, dbOrderId: string) => {
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...(prev.byOrderId[orderId] ?? {
            workingCourse: 1,
            itemCourseMap: {},
            dbIdToCourseMap: {},
            courses: { 1: { courseNumber: 1, status: "open", itemCount: 0 } },
            syncing: false,
          }),
          dbOrderId,
        },
      },
    }));
  },

  loadFromServer: async (orderId: string) => {
    const supabase = _supabaseClient;
    const orderData = get().byOrderId[orderId];
    const dbOrderId = orderData?.dbOrderId;

    if (!supabase || !dbOrderId) {
      console.log("No Supabase client or dbOrderId - skipping server sync");
      return;
    }

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: { ...prev.byOrderId[orderId], syncing: true },
      },
    }));

    try {
      const { data, error } = await supabase.rpc("get_order_courses", {
        p_order_id: dbOrderId,
      });

      if (error) throw error;
      if (!data) return;

      const courses: Record<number, CourseInfo> = {};
      const dbIdToCourseMap: Record<string, number> = {}; // DB item ID -> course number

      (data?.courses || []).forEach((course: any) => {
        courses[course.course_number] = {
          courseNumber: course.course_number,
          status: course.status as CourseStatus,
          firedAt: course.fired_at,
          servedAt: course.served_at,
          itemCount: course.item_count || 0,
          items: course.items,
        };
        // Store mapping by DB item ID (for later lookup when local items have db_order_item_id)
        (course.items || []).forEach((item: any) => {
          dbIdToCourseMap[item.id] = course.course_number;
        });
      });

      if (Object.keys(courses).length === 0) {
        courses[1] = { courseNumber: 1, status: "open", itemCount: 0 };
      }

      const workingCourse =
        data?.working_course ||
        Math.max(
          ...Object.keys(courses)
            .map(Number)
            .filter((n) => courses[n].status === "open"),
          1
        );

      set((prev) => ({
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: {
            workingCourse,
            // Preserve existing local item mappings, merge with any existing
            itemCourseMap: prev.byOrderId[orderId]?.itemCourseMap || {},
            dbIdToCourseMap: {
              ...dbIdToCourseMap,
              ...(prev.byOrderId[orderId]?.dbIdToCourseMap || {}),
            },
            courses,
            syncing: false,
            lastSyncAt: new Date(),
            dbOrderId,
          },
        },
      }));
    } catch (error) {
      console.error("Failed to load courses:", error);
      set((prev) => ({
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: { ...prev.byOrderId[orderId], syncing: false },
        },
      }));
    }
  },

  // ========================================================================
  // GETTERS
  // ========================================================================

  getForOrder: (orderId: string) => get().byOrderId[orderId],

  getWorkingCourse: (orderId: string) =>
    get().byOrderId[orderId]?.workingCourse ?? 1,

  getCourseStatus: (orderId: string, courseNumber: number) => {
    return get().byOrderId[orderId]?.courses[courseNumber]?.status ?? "open";
  },

  isCourseOpen: (orderId: string, courseNumber: number) => {
    return get().getCourseStatus(orderId, courseNumber) === "open";
  },

  isCourseFired: (orderId: string, courseNumber: number) => {
    return get().getCourseStatus(orderId, courseNumber) !== "open";
  },

  getOpenCourses: (orderId: string) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return [1];
    return Object.values(orderData.courses)
      .filter((c) => c.status === "open")
      .map((c) => c.courseNumber)
      .sort((a, b) => a - b);
  },

  getFiredCourses: (orderId: string) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return [];
    return Object.values(orderData.courses)
      .filter((c) => c.status !== "open")
      .map((c) => c.courseNumber)
      .sort((a, b) => a - b);
  },

  getItemCourse: (orderId: string, itemId: string, dbItemId?: string) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return 1;
    
    // First check local itemCourseMap by local ID
    if (orderData.itemCourseMap[itemId] !== undefined) {
      return orderData.itemCourseMap[itemId];
    }
    
    // Then check dbIdToCourseMap by db_order_item_id (from backend)
    if (dbItemId && orderData.dbIdToCourseMap?.[dbItemId] !== undefined) {
      return orderData.dbIdToCourseMap[dbItemId];
    }
    
    // Fall back to working course
    return orderData.workingCourse ?? 1;
  },

  getItemCourseByDbId: (orderId: string, dbItemId: string) => {
    const orderData = get().byOrderId[orderId];
    return orderData?.dbIdToCourseMap?.[dbItemId];
  },

  canModifyItem: (orderId: string, itemId: string) => {
    const courseNumber = get().getItemCourse(orderId, itemId);
    return get().isCourseOpen(orderId, courseNumber);
  },

  // ========================================================================
  // BACKWARD COMPATIBILITY
  // ========================================================================

  setCurrentCourse: (orderId: string, course: number) => {
    get().setWorkingCourse(orderId, course);
  },

  isCourseSent: (orderId: string, course: number) => {
    return get().isCourseFired(orderId, course);
  },

  getSentCourses: (orderId: string) => get().getFiredCourses(orderId),

  getUnsentCourses: (orderId: string) => get().getOpenCourses(orderId),

  markCourseSent: (orderId: string, course: number) => {
    get().fireCourse(orderId, course).catch(console.error);
  },

  getAllCourseStatuses: (orderId: string) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return {};
    const statuses: Record<number, "unsent" | "sent" | "in_progress"> = {};
    Object.values(orderData.courses).forEach((c) => {
      if (c.status === "open") statuses[c.courseNumber] = "unsent";
      else if (c.status === "in_progress")
        statuses[c.courseNumber] = "in_progress";
      else statuses[c.courseNumber] = "sent";
    });
    return statuses;
  },

  // ========================================================================
  // LOCAL ACTIONS
  // ========================================================================

  setWorkingCourse: (orderId: string, courseNumber: number) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    if (
      orderData.courses[courseNumber]?.status !== "open" &&
      orderData.courses[courseNumber]
    ) {
      console.warn(`Cannot set working course to fired course ${courseNumber}`);
      return;
    }

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          workingCourse: courseNumber,
          courses: {
            ...prev.byOrderId[orderId].courses,
            [courseNumber]: prev.byOrderId[orderId].courses[courseNumber] ?? {
              courseNumber,
              status: "open",
              itemCount: 0,
            },
          },
        },
      },
    }));

    // Sync to server if we have dbOrderId
    const dbOrderId = orderData.dbOrderId;
    if (_supabaseClient && dbOrderId) {
      _supabaseClient
        .rpc("set_working_course", {
          p_order_id: dbOrderId,
          p_course_number: courseNumber,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to sync working course:", error);
        });
    }
  },

  setItemCourse: (
    orderId: string,
    itemId: string,
    courseNumber: number,
    dbItemId?: string
  ) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    if (
      orderData.courses[courseNumber]?.status !== "open" &&
      orderData.courses[courseNumber]
    ) {
      return;
    }
    console.log("[setItemCourse] orderData", orderData);

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          itemCourseMap: {
            ...prev.byOrderId[orderId].itemCourseMap,
            [itemId]: courseNumber,
          },
          // Also update dbIdToCourseMap if we have a dbItemId
          dbIdToCourseMap: dbItemId ? {
            ...prev.byOrderId[orderId].dbIdToCourseMap,
            [dbItemId]: courseNumber,
          } : prev.byOrderId[orderId].dbIdToCourseMap,
          courses: {
            ...prev.byOrderId[orderId].courses,
            [courseNumber]: prev.byOrderId[orderId].courses[courseNumber] ?? {
              courseNumber,
              status: "open",
              itemCount: 0,
            },
          },
        },
      },
    }));

    // Sync to backend if we have a valid DB Item ID
    const dbOrderId = orderData.dbOrderId;
    if (_supabaseClient && dbOrderId && dbItemId && isValidUUID(dbItemId)) {
      _supabaseClient
        .rpc("set_item_course", {
          p_order_item_id: dbItemId,
          p_course_number: courseNumber,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to sync item course:", error);
        });
    }
  },

  assignItemsToWorkingCourse: (orderId: string, itemIds: string[]) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return;

    set((prev) => {
      const newMap = { ...prev.byOrderId[orderId].itemCourseMap };
      itemIds.forEach((id) => {
        if (newMap[id] === undefined) newMap[id] = orderData.workingCourse;
      });
      return {
        byOrderId: {
          ...prev.byOrderId,
          [orderId]: { ...prev.byOrderId[orderId], itemCourseMap: newMap },
        },
      };
    });
  },

  finalizeCurrentCourse: (orderId: string, itemIds: string[]) => {
    const orderData = get().byOrderId[orderId];
    if (!orderData) return 1;

    const currentCourse = orderData.workingCourse;
    const newItemCourseMap = { ...orderData.itemCourseMap };
    itemIds.forEach((id) => {
      if (newItemCourseMap[id] === undefined)
        newItemCourseMap[id] = currentCourse;
    });

    const maxCourse = Math.max(
      ...Object.values(newItemCourseMap),
      currentCourse
    );
    const nextCourse = maxCourse + 1;

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...orderData,
          itemCourseMap: newItemCourseMap,
          workingCourse: nextCourse,
          courses: {
            ...orderData.courses,
            [nextCourse]: {
              courseNumber: nextCourse,
              status: "open",
              itemCount: 0,
            },
          },
        },
      },
    }));

    const dbOrderId = orderData.dbOrderId;
    if (_supabaseClient && dbOrderId) {
      _supabaseClient
        .rpc("create_next_course", { p_order_id: dbOrderId })
        .then(({ error }) => {
          if (error) console.error("Failed to sync new course:", error);
        });
    }

    return nextCourse;
  },

  // ========================================================================
  // SERVER SYNCED ACTIONS
  // ========================================================================

  createNextCourse: async (orderId: string) => {
    const orderData = get().byOrderId[orderId];
    const currentMax = Math.max(
      ...Object.keys(orderData?.courses || { 1: true }).map(Number),
      0
    );
    const nextCourse = currentMax + 1;

    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          workingCourse: nextCourse,
          courses: {
            ...prev.byOrderId[orderId].courses,
            [nextCourse]: {
              courseNumber: nextCourse,
              status: "open",
              itemCount: 0,
            },
          },
        },
      },
    }));

    const dbOrderId = orderData?.dbOrderId;
    if (_supabaseClient && dbOrderId) {
      try {
        const { data, error } = await _supabaseClient.rpc(
          "create_next_course",
          {
            p_order_id: dbOrderId,
          }
        );
        if (error) throw error;
        const serverCourse = data?.course_number || nextCourse;
        if (serverCourse !== nextCourse) {
          set((prev) => ({
            byOrderId: {
              ...prev.byOrderId,
              [orderId]: {
                ...prev.byOrderId[orderId],
                workingCourse: serverCourse,
                courses: {
                  ...prev.byOrderId[orderId].courses,
                  [serverCourse]: {
                    courseNumber: serverCourse,
                    status: "open",
                    itemCount: 0,
                  },
                },
              },
            },
          }));
          return serverCourse;
        }
      } catch (error) {
        console.error("Failed to create course on server:", error);
      }
    }
    return nextCourse;
  },

  fireCourse: async (orderId: string, courseNumber: number) => {
    // SYNC BARRIER: Ensure all items are synced before firing course
    const orderStore = useOrderStore.getState();

    if (orderStore.hasPendingSyncs(orderId)) {
      console.log(
        "[fireCourse] Waiting for pending syncs before firing course..."
      );
      await orderStore.waitForPendingSyncs(orderId);
    }

    const orderData = get().byOrderId[orderId];
    if (!orderData) throw new Error("Order not initialized");

    if (orderData.courses[courseNumber]?.status !== "open") {
      throw new Error(`Course ${courseNumber} is already fired`);
    }

    // 1. ALWAYS update local state first (optimistic)
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          courses: {
            ...prev.byOrderId[orderId].courses,
            [courseNumber]: {
              ...prev.byOrderId[orderId].courses[courseNumber],
              status: "fired",
              firedAt: new Date().toISOString(),
            },
          },
          workingCourse:
            prev.byOrderId[orderId].workingCourse === courseNumber
              ? courseNumber + 1
              : prev.byOrderId[orderId].workingCourse,
        },
      },
    }));

    // Try to resolve order ID from registry if it's a local ID
    let dbOrderId = orderData.dbOrderId;
    if (!dbOrderId && isLocalId(orderId)) {
      dbOrderId = resolveToBackendId(orderId) || undefined;
    }

    const isOnline = getIsOnline();

    // 2. Try backend if online and have a dbOrderId
    if (isOnline && _supabaseClient && dbOrderId) {
      try {
        const { error } = await _supabaseClient.rpc("fire_course", {
          p_order_id: dbOrderId,
          p_course_number: courseNumber,
        });
        console.log(
          "Fired course on server:",
          courseNumber,
          "dbOrderId:",
          dbOrderId
        );

        if (error) {
          console.error("[fireCourse] Backend error, queuing for retry:", error);
          // OFFLINE-FIRST: Don't revert, queue for retry instead
          await queueOperation({
            type: "fire_course",
            params: {
              dbOrderId,
              courseNumber,
              localOrderId: orderId, // Include for ID resolution during sync
            },
            localOrderId: orderId,
          });
        } else {
          // Success - optionally load from server to sync
          get().loadFromServer(orderId);
        }
      } catch (error) {
        console.error("[fireCourse] Exception, queuing for retry:", error);
        // OFFLINE-FIRST: Don't revert, queue for retry instead
        await queueOperation({
          type: "fire_course",
          params: {
            dbOrderId,
            courseNumber,
            localOrderId: orderId, // Include for ID resolution during sync
          },
          localOrderId: orderId,
        });
      }
    } else if (!isOnline || !dbOrderId) {
      // 3. Offline or no dbOrderId - queue for later sync
      console.log("[fireCourse] Offline or no dbOrderId, queuing operation");
      await queueOperation({
        type: "fire_course",
        params: {
          dbOrderId,
          courseNumber,
          localOrderId: orderId, // Include for ID resolution during sync
        },
        localOrderId: orderId,
      });
    }
    // Note: We no longer revert on error - the course stays "fired" locally
    // and will sync when the backend becomes available
  },

  markCourseServed: async (orderId: string, courseNumber: number) => {
    set((prev) => ({
      byOrderId: {
        ...prev.byOrderId,
        [orderId]: {
          ...prev.byOrderId[orderId],
          courses: {
            ...prev.byOrderId[orderId].courses,
            [courseNumber]: {
              ...prev.byOrderId[orderId].courses[courseNumber],
              status: "served",
              servedAt: new Date().toISOString(),
            },
          },
        },
      },
    }));

    const dbOrderId = get().byOrderId[orderId]?.dbOrderId;
    if (_supabaseClient && dbOrderId) {
      const { error } = await _supabaseClient.rpc("mark_course_served", {
        p_order_id: dbOrderId,
        p_course_number: courseNumber,
      });
      if (error) {
        console.error("Failed to mark course served:", error);
        get().loadFromServer(orderId);
      }
    }
  },

  // ========================================================================
  // CLEANUP
  // ========================================================================

  clearOrder: (orderId: string) => {
    set((prev) => {
      const { [orderId]: _, ...remaining } = prev.byOrderId;
      return { byOrderId: remaining };
    });
  },
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectWorkingCourse =
  (orderId: string) => (state: CoursingState) =>
    state.getWorkingCourse(orderId);

export const selectCanAddToCurrentCourse =
  (orderId: string) => (state: CoursingState) => {
    const workingCourse = state.getWorkingCourse(orderId);
    return state.isCourseOpen(orderId, workingCourse);
  };

export const selectCourseCount =
  (orderId: string) => (state: CoursingState) => {
    const orderData = state.byOrderId[orderId];
    return Object.keys(orderData?.courses || {}).length;
  };
