import { TimeClockAction, TimeClockStatus } from '@/types/time-clock';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface TimeClockStore {
    // State
    status: TimeClockStatus;
    shiftId: string | null;
    offlineQueue: TimeClockAction[];
    isSyncing: boolean;

    // Actions
    setStatus: (status: TimeClockStatus, shiftId?: string | null) => void;
    queueAction: (action: TimeClockAction) => void;
    removeFromQueue: (actionId: string) => void;
    setSyncing: (isSyncing: boolean) => void;
    clearState: () => void;
}

export const useTimeClockStore = create<TimeClockStore>()(
    persist(
        (set) => ({
            status: 'idle',
            shiftId: null,
            offlineQueue: [],
            isSyncing: false,

            setStatus: (status, shiftId) => set((state) => ({
                status,
                shiftId: shiftId !== undefined ? shiftId : state.shiftId
            })),

            queueAction: (action) => set((state) => ({
                offlineQueue: [...state.offlineQueue, action]
            })),

            removeFromQueue: (actionId) => set((state) => ({
                offlineQueue: state.offlineQueue.filter((a) => a.id !== actionId)
            })),

            setSyncing: (isSyncing) => set({ isSyncing }),

            clearState: () => set({
                status: 'idle',
                shiftId: null,
                offlineQueue: []
            }),
        }),
        {
            name: 'dexa-pos-timeclock',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);