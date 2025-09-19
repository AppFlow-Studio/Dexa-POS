import { create } from "zustand";

type OrderCoursing = {
    currentCourse: number;
    itemCourseMap: Record<string, number>; // itemId -> course
    sentCourses: Record<number, boolean>; // course -> sent
};

type CoursingState = {
    byOrderId: Record<string, OrderCoursing>;
    initializeForOrder: (orderId: string) => void;
    getForOrder: (orderId: string) => OrderCoursing | undefined;
    setCurrentCourse: (orderId: string, course: number) => void;
    setItemCourse: (orderId: string, itemId: string, course: number) => void;
    finalizeCurrentCourse: (orderId: string, itemIds: string[]) => number; // returns new current course
    markCourseSent: (orderId: string, course: number) => void;
    isCourseSent: (orderId: string, course: number) => boolean;
    getSentCourses: (orderId: string) => number[];
    getUnsentCourses: (orderId: string) => number[];
    getCourseStatus: (orderId: string, course: number) => 'unsent' | 'sent' | 'in_progress' | 'not_found';
    getAllCourseStatuses: (orderId: string) => Record<number, 'unsent' | 'sent' | 'in_progress'>;
};

export const useCoursingStore = create<CoursingState>((set, get) => ({
    byOrderId: {},

    initializeForOrder: (orderId) => {
        const state = get();
        // If already initialized, bail to preserve existing mapping across navigation/pay flows
        if (state.byOrderId[orderId]) return;
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    currentCourse: 1,
                    itemCourseMap: {},
                    sentCourses: {},
                },
            },
        }));
    },

    getForOrder: (orderId) => get().byOrderId[orderId],

    setCurrentCourse: (orderId, course) => {
        if (course < 1) course = 1;
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...(prev.byOrderId[orderId] ?? { currentCourse: 1, itemCourseMap: {}, sentCourses: {} }),
                    currentCourse: course,
                },
            },
        }));
    },

    setItemCourse: (orderId, itemId, course) => {
        if (course < 1) course = 1;
        set((prev) => {
            const existing = prev.byOrderId[orderId] ?? { currentCourse: 1, itemCourseMap: {}, sentCourses: {} };
            return {
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        ...existing,
                        itemCourseMap: { ...existing.itemCourseMap, [itemId]: course },
                    },
                },
            };
        });
    },

    finalizeCurrentCourse: (orderId, itemIds) => {
        const state = get();
        const data = state.byOrderId[orderId] ?? { currentCourse: 1, itemCourseMap: {}, sentCourses: {} };
        const itemCourseMap = { ...data.itemCourseMap };
        // Assign current course to any items without a course
        itemIds.forEach((id) => {
            if (itemCourseMap[id] === undefined) itemCourseMap[id] = data.currentCourse;
        });
        // Compute next course as max existing + 1
        const existingCourses = Object.values(itemCourseMap);
        const maxCourse = existingCourses.length > 0 ? Math.max(...existingCourses) : data.currentCourse;
        const nextCourse = maxCourse + 1;
        set((prev) => ({
            byOrderId: {
                ...prev.byOrderId,
                [orderId]: {
                    ...data,
                    itemCourseMap,
                    currentCourse: nextCourse,
                },
            },
        }));
        return nextCourse;
    },

    markCourseSent: (orderId, course) => {
        set((prev) => {
            const existing = prev.byOrderId[orderId] ?? { currentCourse: 1, itemCourseMap: {}, sentCourses: {} };
            return {
                byOrderId: {
                    ...prev.byOrderId,
                    [orderId]: {
                        ...existing,
                        sentCourses: { ...existing.sentCourses, [course]: true },
                    },
                },
            };
        });
    },

    // Helper function to check if a specific course was sent
    isCourseSent: (orderId, course) => {
        const state = get();
        const orderCoursing = state.byOrderId[orderId];
        if (!orderCoursing) return false;
        return !!orderCoursing.sentCourses[course];
    },

    // Helper function to get all sent courses for an order
    getSentCourses: (orderId) => {
        const state = get();
        const orderCoursing = state.byOrderId[orderId];
        if (!orderCoursing) return [];

        return Object.entries(orderCoursing.sentCourses)
            .filter(([_, isSent]) => isSent)
            .map(([course, _]) => Number(course))
            .sort((a, b) => a - b);
    },

    // Helper function to get all unsent courses for an order
    getUnsentCourses: (orderId) => {
        const state = get();
        const orderCoursing = state.byOrderId[orderId];
        if (!orderCoursing) return [];

        // Get all courses that have items assigned to them
        const allCourses = new Set<number>();
        Object.values(orderCoursing.itemCourseMap).forEach(course => {
            allCourses.add(course);
        });

        // Filter out sent courses
        return Array.from(allCourses)
            .filter(course => !orderCoursing.sentCourses[course])
            .sort((a, b) => a - b);
    },

    // Helper function to get detailed status of a specific course
    getCourseStatus: (orderId, course) => {
        const state = get();
        const orderCoursing = state.byOrderId[orderId];
        if (!orderCoursing) return 'not_found';

        // Check if course has any items assigned to it
        const hasItems = Object.values(orderCoursing.itemCourseMap).includes(course);
        if (!hasItems) return 'not_found';

        // Check if course was sent
        if (orderCoursing.sentCourses[course]) {
            return 'sent';
        }

        // Course exists but not sent
        return 'unsent';
    },

    // Helper function to get status of all courses for an order
    getAllCourseStatuses: (orderId) => {
        const state = get();
        const orderCoursing = state.byOrderId[orderId];
        if (!orderCoursing) return {};

        const statuses: Record<number, 'unsent' | 'sent' | 'in_progress'> = {};

        // Get all courses that have items assigned to them
        const allCourses = new Set<number>();
        Object.values(orderCoursing.itemCourseMap).forEach(course => {
            allCourses.add(course);
        });

        // Determine status for each course
        Array.from(allCourses).forEach(course => {
            if (orderCoursing.sentCourses[course]) {
                statuses[course] = 'sent';
            } else {
                statuses[course] = 'unsent';
            }
        });

        return statuses;
    },
}));


