
// ============================================================================
// DEXA POS - Coursing Store (Enhanced with Server Sync)
// Local-first coursing with Supabase persistence
// ============================================================================

import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { create } from "zustand";

// ============================================================================
// TYPES
// ============================================================================

type CourseStatus = 'open' | 'fired' | 'in_progress' | 'served' | 'completed';

interface CourseInfo {
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
    workingCourse: number;           // Course we're currently adding items to
    itemCourseMap: Record<string, number>;  // itemId -> course
    courses: Record<number, CourseInfo>;    // courseNumber -> info
    syncing: boolean;
    lastSyncAt?: Date;
};

type CoursingState = {
    byOrderId: Record<string, OrderCoursing>;

    // Initialization
    initializeForOrder: (orderId: string) => void;
    loadFromServer: (orderId: string) => Promise<void>;

    // Getters
    getForOrder: (orderId: string) => OrderCoursing | undefined;
    getWorkingCourse: (orderId: string) => number;
    getCourseStatus: (orderId: string, courseNumber: number) => CourseStatus;
    isCourseOpen: (orderId: string, courseNumber: number) => boolean;
    isCourseFired: (orderId: string, courseNumber: number) => boolean;
    getOpenCourses: (orderId: string) => number[];
    getFiredCourses: (orderId: string) => number[];
    getItemCourse: (orderId: string, itemId: string) => number;
    canModifyItem: (orderId: string, itemId: string) => boolean;

    // Actions - Local (instant UI)
    setWorkingCourse: (orderId: string, courseNumber: number) => void;
    setItemCourse: (orderId: string, itemId: string, courseNumber: number) => void;
    assignItemsToWorkingCourse: (orderId: string, itemIds: string[]) => void;

    // Actions - Server Synced
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

    initializeForOrder: (orderId) => {
        const state = get();
        if (state.byOrderId[orderId]) return; // Already initialized

        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    workingCourse: 1,
                    itemCourseMap: {},
                    courses: {
                        1: { courseNumber: 1, status: 'open', itemCount: 0 }
                    },
                    syncing: false,
                },
            },
        }));

        // Load from server in background
        get().loadFromServer(orderId).catch(console.error);
    },

    loadFromServer: async (orderId) => {
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...(prev.byOrderId[orderId] ?? { workingCourse: 1, itemCourseMap: {}, courses: {} }),
                    syncing: true,
                },
            },
        }));

        try {
            const supabase = useSupabaseClient();
            const { data, error } = await supabase.rpc('get_order_courses', {
                p_order_id: orderId
            });

            if (error) throw error;

            // Build courses map
            const courses: Record<number, CourseInfo> = {};
            const itemCourseMap: Record<string, number> = {};

            (data?.courses || []).forEach((course: any) => {
                courses[course.course_number] = {
                    courseNumber: course.course_number,
                    status: course.status as CourseStatus,
                    firedAt: course.fired_at,
                    servedAt: course.served_at,
                    itemCount: course.item_count || 0,
                    items: course.items,
                };

                // Build item -> course map
                (course.items || []).forEach((item: any) => {
                    itemCourseMap[item.id] = course.course_number;
                });
            });

            // Ensure at least course 1 exists
            if (Object.keys(courses).length === 0) {
                courses[1] = { courseNumber: 1, status: 'open', itemCount: 0 };
            }

            const workingCourse = data?.working_course ||
                Math.max(...Object.keys(courses).map(Number).filter(n => courses[n].status === 'open'), 1);

            set((prev) => ({
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        workingCourse,
                        itemCourseMap,
                        courses,
                        syncing: false,
                        lastSyncAt: new Date(),
                    },
                },
            }));
        } catch (error) {
            console.error('Failed to load courses:', error);
            set((prev) => ({
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        ...(prev.byOrderId[orderId] ?? { workingCourse: 1, itemCourseMap: {}, courses: {} }),
                        syncing: false,
                    },
                },
            }));
        }
    },

    // ========================================================================
    // GETTERS
    // ========================================================================

    getForOrder: (orderId) => get().byOrderId[orderId],

    getWorkingCourse: (orderId) => {
        return get().byOrderId[orderId]?.workingCourse ?? 1;
    },

    getCourseStatus: (orderId, courseNumber) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return 'open';
        return orderData.courses[courseNumber]?.status ?? 'open';
    },

    isCourseOpen: (orderId, courseNumber) => {
        return get().getCourseStatus(orderId, courseNumber) === 'open';
    },

    isCourseFired: (orderId, courseNumber) => {
        const status = get().getCourseStatus(orderId, courseNumber);
        return status !== 'open'; // fired, in_progress, served, completed are all "fired"
    },

    getOpenCourses: (orderId) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return [1];

        return Object.values(orderData.courses)
            .filter(c => c.status === 'open')
            .map(c => c.courseNumber)
            .sort((a, b) => a - b);
    },

    getFiredCourses: (orderId) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return [];

        return Object.values(orderData.courses)
            .filter(c => c.status !== 'open')
            .map(c => c.courseNumber)
            .sort((a, b) => a - b);
    },

    getItemCourse: (orderId, itemId) => {
        const orderData = get().byOrderId[orderId];
        return orderData?.itemCourseMap[itemId] ?? orderData?.workingCourse ?? 1;
    },

    canModifyItem: (orderId, itemId) => {
        const courseNumber = get().getItemCourse(orderId, itemId);
        return get().isCourseOpen(orderId, courseNumber);
    },

    // ========================================================================
    // LOCAL ACTIONS (Instant UI)
    // ========================================================================

    setWorkingCourse: (orderId, courseNumber) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return;

        // Can't set working course to a fired course
        if (orderData.courses[courseNumber]?.status !== 'open' && orderData.courses[courseNumber]) {
            console.warn(`Cannot set working course to fired course ${courseNumber}`);
            return;
        }

        // Update locally immediately
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
                            status: 'open',
                            itemCount: 0,
                        },
                    },
                },
            },
        }));

        // Sync to server in background
        const supabase = useSupabaseClient();
        supabase.rpc('set_working_course', {
            p_order_id: orderId,
            p_course_number: courseNumber
        })
    },

    setItemCourse: (orderId, itemId, courseNumber) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return;

        // Can't move item to a fired course
        if (orderData.courses[courseNumber]?.status !== 'open' && orderData.courses[courseNumber]) {
            console.warn(`Cannot move item to fired course ${courseNumber}`);
            return;
        }

        // Update locally immediately
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...prev.byOrderId[orderId],
                    itemCourseMap: {
                        ...prev.byOrderId[orderId].itemCourseMap,
                        [itemId]: courseNumber,
                    },
                    courses: {
                        ...prev.byOrderId[orderId].courses,
                        [courseNumber]: prev.byOrderId[orderId].courses[courseNumber] ?? {
                            courseNumber,
                            status: 'open',
                            itemCount: 0,
                        },
                    },
                },
            },
        }));

        // Sync to server in background
        const supabase = useSupabaseClient();
        supabase.rpc('set_item_course', {
            p_order_item_id: itemId,
            p_course_number: courseNumber
        })

    },

    assignItemsToWorkingCourse: (orderId, itemIds) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) return;

        const workingCourse = orderData.workingCourse;

        // Update all items locally
        set((prev) => {
            const newItemCourseMap = { ...prev.byOrderId[orderId].itemCourseMap };
            itemIds.forEach(id => {
                // Only assign if not already assigned
                if (newItemCourseMap[id] === undefined) {
                    newItemCourseMap[id] = workingCourse;
                }
            });

            return {
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        ...prev.byOrderId[orderId],
                        itemCourseMap: newItemCourseMap,
                    },
                },
            };
        });
    },

    // ========================================================================
    // SERVER SYNCED ACTIONS
    // ========================================================================

    createNextCourse: async (orderId) => {
        const orderData = get().byOrderId[orderId];
        const currentMax = Math.max(
            ...Object.keys(orderData?.courses || { 1: true }).map(Number),
            0
        );
        const nextCourse = currentMax + 1;

        // Optimistic update
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
                            status: 'open',
                            itemCount: 0,
                        },
                    },
                },
            },
        }));

        // Sync to server
        try {
            const supabase = useSupabaseClient();
            const { data, error } = await supabase.rpc('create_next_course', {
                p_order_id: orderId
            });

            if (error) throw error;

            // Update with server response (might differ if concurrent changes)
            const serverCourse = data.course_number;
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
                                    status: 'open',
                                    itemCount: 0,
                                },
                            },
                        },
                    },
                }));
                return serverCourse;
            }

            return nextCourse;
        } catch (error) {
            // Revert on error
            set((prev) => {
                const { [nextCourse]: _, ...remainingCourses } = prev.byOrderId[orderId].courses;
                return {
                    byOrderId: {
                        ...prev.byOrderId,
                        [orderId]: {
                            ...prev.byOrderId[orderId],
                            workingCourse: currentMax || 1,
                            courses: remainingCourses,
                        },
                    },
                };
            });
            throw error;
        }
    },

    fireCourse: async (orderId, courseNumber) => {
        const orderData = get().byOrderId[orderId];
        if (!orderData) throw new Error('Order not initialized');

        // Check course is open
        if (orderData.courses[courseNumber]?.status !== 'open') {
            throw new Error(`Course ${courseNumber} is already fired`);
        }

        // Optimistic update
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...prev.byOrderId[orderId],
                    courses: {
                        ...prev.byOrderId[orderId].courses,
                        [courseNumber]: {
                            ...prev.byOrderId[orderId].courses[courseNumber],
                            status: 'fired',
                            firedAt: new Date().toISOString(),
                        },
                    },
                    // Auto-advance working course if we fired the current one
                    workingCourse: prev.byOrderId[orderId].workingCourse === courseNumber
                        ? courseNumber + 1
                        : prev.byOrderId[orderId].workingCourse,
                },
            },
        }));

        // Sync to server
        try {
            const supabase = useSupabaseClient();
            const { data, error } = await supabase.rpc('fire_course', {
                p_order_id: orderId,
                p_course_number: courseNumber
            });

            if (error) throw error;

            // Reload to get accurate state
            get().loadFromServer(orderId);
        } catch (error) {
            // Revert on error
            set((prev) => ({
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        ...prev.byOrderId[orderId],
                        courses: {
                            ...prev.byOrderId[orderId].courses,
                            [courseNumber]: {
                                ...prev.byOrderId[orderId].courses[courseNumber],
                                status: 'open',
                                firedAt: undefined,
                            },
                        },
                    },
                },
            }));
            throw error;
        }
    },

    markCourseServed: async (orderId, courseNumber) => {
        // Optimistic update
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...prev.byOrderId[orderId],
                    courses: {
                        ...prev.byOrderId[orderId].courses,
                        [courseNumber]: {
                            ...prev.byOrderId[orderId].courses[courseNumber],
                            status: 'served',
                            servedAt: new Date().toISOString(),
                        },
                    },
                },
            },
        }));

        // Sync to server
        const supabase = useSupabaseClient();
        const { error } = await supabase.rpc('mark_course_served', {
            p_order_id: orderId,
            p_course_number: courseNumber
        });

        if (error) {
            console.error('Failed to mark course served:', error);
            // Reload to get accurate state
            get().loadFromServer(orderId);
        }
    },

    // ========================================================================
    // CLEANUP
    // ========================================================================

    clearOrder: (orderId) => {
        set((prev) => {
            const { [orderId]: _, ...remaining } = prev.byOrderId;
            return { byOrderId: remaining };
        });
    },
}));

// ============================================================================
// SELECTORS
// ============================================================================

export const selectWorkingCourse = (orderId: string) => (state: CoursingState) =>
    state.getWorkingCourse(orderId);

export const selectCanAddToCurrentCourse = (orderId: string) => (state: CoursingState) => {
    const workingCourse = state.getWorkingCourse(orderId);
    return state.isCourseOpen(orderId, workingCourse);
};

export const selectCourseCount = (orderId: string) => (state: CoursingState) => {
    const orderData = state.byOrderId[orderId];
    return Object.keys(orderData?.courses || {}).length;
};
