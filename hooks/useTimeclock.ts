import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { toastService } from '@/lib/toastService';
import { useEmployeeStore } from '@/stores/useEmployeeStore';
import { useTimeClockStore } from '@/stores/useTimeClock';
import { TimeClockAction, TimeClockActionType } from '@/types/time-clock';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

export interface UseTimeClockOptions {
    onSuccess?: (type: TimeClockActionType, employeeName?: string) => void;
    onError?: (type: TimeClockActionType, error: string) => void;
}

export const useTimeClock = (options?: UseTimeClockOptions) => {
    const store = useTimeClockStore();
    const supabase = useSupabaseClient();

    // 1. The Core Action Handler
    const performAction = useCallback(async (
        type: TimeClockActionType,
        pinCode: string,
        locationId: string,
        deviceId: string
    ) => {
        const previousStatus = store.status;

        // A. Create the payload
        const actionPayload: TimeClockAction = {
            id: uuidv4(),
            type,
            pinCode,
            locationId,
            timestamp: new Date().toISOString(),
            deviceId
        };

        // B. Optimistic Update (Immediate Feedback)
        let nextStatus = store.status;
        switch (type) {
            case 'clock_in': nextStatus = 'active'; break;
            case 'clock_out': nextStatus = 'idle'; break;
            case 'break_start': nextStatus = 'on_break'; break;
            case 'break_end': nextStatus = 'active'; break;
        }
        store.setStatus(nextStatus);

        // C. Network Check & Execution
        const netState = await NetInfo.fetch();

        if (netState.isConnected && netState.isInternetReachable) {
            try {
                // --- ONLINE PATH ---
                const { data, error } = await supabase.rpc('handle_time_clock', {
                    p_pin_code: pinCode,
                    p_location_id: locationId,
                    p_action_type: type,
                    p_device_id: deviceId
                });
                console.log('handle_time_clock response', data, error);

                if (error) throw error;

                // Update real ID from server response if clocking in
                if (type === 'clock_in' && data?.shift_id) {
                    store.setStatus(nextStatus, data.shift_id);
                }

                // Update employee store to keep local state in sync
                if (data?.employee_id) {
                    const employeeStore = useEmployeeStore.getState();
                    if (type === 'clock_in') {
                        employeeStore.clockIn(data.employee_id);
                    } else if (type === 'clock_out') {
                        employeeStore.clockOut(data.employee_id);
                    }
                }

                // Show success toast and call success callback
                const employeeName = data?.employee_name;
                const successMessages: Record<TimeClockActionType, { title: string; message: string }> = {
                    clock_in: {
                        title: 'Clock In Successful',
                        message: employeeName ? `Welcome, ${employeeName}!` : 'You have been clocked in successfully.'
                    },
                    clock_out: {
                        title: 'Clock Out Successful',
                        message: employeeName ? `Goodbye, ${employeeName}!` : 'You have been clocked out successfully.'
                    },
                    break_start: {
                        title: 'Break Started',
                        message: 'Your break has started. Enjoy your rest!'
                    },
                    break_end: {
                        title: 'Break Ended',
                        message: 'Welcome back! Your break has ended.'
                    },
                };

                toastService.show({
                    ...successMessages[type],
                    type: 'success',
                });

                options?.onSuccess?.(type, employeeName);

            } catch (error: any) {
                // Revert optimistic update on hard failure
                store.setStatus(previousStatus);

                const errorMessage = error.message || 'Failed to update time clock';
                const isNetworkError = errorMessage?.includes('network') ||
                    errorMessage?.includes('fetch') ||
                    errorMessage?.includes('timeout') ||
                    !error.code; // Supabase errors usually have codes

                if (isNetworkError) {
                    // Network error: queue for later sync
                    store.queueAction(actionPayload);
                    toastService.show({
                        title: 'Offline Mode',
                        message: 'Your action will be synced when connection is restored.',
                        type: 'warning',
                    });
                } else {
                    // Logic error (e.g., Wrong PIN, Already clocked in): show error
                    const errorMessages: Record<TimeClockActionType, string> = {
                        clock_in: 'Failed to clock in. Please check your PIN and try again.',
                        clock_out: 'Failed to clock out. Please try again.',
                        break_start: 'Failed to start break. Please try again.',
                        break_end: 'Failed to end break. Please try again.',
                    };

                    toastService.show({
                        title: 'Clock Error',
                        message: errorMessage.includes('PIN') || errorMessage.includes('pin')
                            ? 'The PIN you entered is incorrect.'
                            : errorMessages[type],
                        type: 'error',
                    });

                    options?.onError?.(type, errorMessage);
                }
            }
        } else {
            // --- OFFLINE PATH ---
            console.log('Offline: Queueing time clock action');
            store.queueAction(actionPayload);
            toastService.show({
                title: 'Offline Mode',
                message: 'Your action will be synced when connection is restored.',
                type: 'warning',
            });
        }
    }, [store, supabase, options]);


    // 2. Sync Processor (The "Queue Flusher")
    // Automatically runs when internet comes back or queue changes
    useEffect(() => {
        const processQueue = async () => {
            if (store.offlineQueue.length === 0 || store.isSyncing) return;

            const netState = await NetInfo.fetch();
            if (!netState.isConnected || !netState.isInternetReachable) return;

            store.setSyncing(true);

            // Process strictly in order (FIFO)
            // We process one at a time to ensure backend state consistency
            const actionToProcess = store.offlineQueue[0];

            try {
                console.log(`Syncing action: ${actionToProcess.type}`);

                const { error } = await supabase.rpc('handle_time_clock', {
                    p_pin_code: actionToProcess.pinCode,
                    p_location_id: actionToProcess.locationId,
                    p_action_type: actionToProcess.type,
                    p_device_id: actionToProcess.deviceId
                });

                if (error) {
                    console.error("Sync failed for action", actionToProcess.id, error);
                    // If it's a "Wrong PIN" error stored offline, we discard it
                    // Otherwise, keep it in queue for retry
                    const isLogicError = error.code && !error.message?.includes('network');
                    if (isLogicError) {
                        // Logic error (wrong PIN, etc.) - remove from queue
                        store.removeFromQueue(actionToProcess.id);
                        toastService.show({
                            title: 'Sync Warning',
                            message: 'An offline action could not be processed. It has been removed.',
                            type: 'warning',
                        });
                    }
                    // Network errors will be retried on next interval
                } else {
                    // Success: Remove from queue
                    store.removeFromQueue(actionToProcess.id);
                    if (store.offlineQueue.length === 1) {
                        // Last item in queue was just processed
                        toastService.show({
                            title: 'Sync Complete',
                            message: 'All pending actions have been synced.',
                            type: 'success',
                        });
                    }
                }
            } catch (e) {
                console.error("Critical Sync Error", e);
            } finally {
                store.setSyncing(false);
            }
        };

        // Run processor on mount and whenever queue changes
        processQueue();

        // Set up a poller interval for aggressive syncing
        const interval = setInterval(processQueue, 10000);
        return () => clearInterval(interval);

    }, [store.offlineQueue, store.isSyncing, supabase]);

    return {
        status: store.status,
        shiftId: store.shiftId,
        isSyncing: store.isSyncing,
        pendingActions: store.offlineQueue.length,
        clockIn: (pin: string, loc: string, dev: string) => performAction('clock_in', pin, loc, dev),
        clockOut: (pin: string, loc: string, dev: string) => performAction('clock_out', pin, loc, dev),
        startBreak: (pin: string, loc: string, dev: string) => performAction('break_start', pin, loc, dev),
        endBreak: (pin: string, loc: string, dev: string) => performAction('break_end', pin, loc, dev),
    };
};