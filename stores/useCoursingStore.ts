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
};

export const useCoursingStore = create<CoursingState>((set, get) => ({
    byOrderId: {},

    initializeForOrder: (orderId) => {
        const state = get();
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
}));


