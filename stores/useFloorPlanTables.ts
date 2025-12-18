// ============================================================================
// DEXA POS - Floor Plan Store with Supabase Realtime Sync
// Zustand store enhanced with database persistence and multi-device sync
// ============================================================================

import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { TABLE_SHAPES } from '@/lib/table-shapes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RealtimeChannel } from '@supabase/supabase-js';
import { create } from 'zustand';
import { createJSONStorage, persist, subscribeWithSelector } from 'zustand/middleware';

// ============================================================================
// TYPES
// ============================================================================

export type TableStatus =
    | 'available'
    | 'reserved'
    | 'seated'
    | 'ordered'
    | 'served'
    | 'check_presented'
    | 'paid'
    | 'cleaning'
    | 'blocked'
    | 'not_in_service';

export type ObjectCategory = 'table' | 'booth' | 'functional' | 'structure' | 'decor' | 'zone';

export interface FloorPlanObject {
    id: string;
    floor_plan_id: string;
    name: string;
    shape_id: keyof typeof TABLE_SHAPES;
    category: ObjectCategory;
    x: number;
    y: number;
    rotation: number;
    width?: number;
    height?: number;
    capacity?: number;
    min_capacity?: number;
    is_reservable?: boolean;
    is_combinable?: boolean;
    default_turn_time?: number;
    section_id?: string;
    zone_name?: string;
    label_override?: string;
    color_override?: string;
    z_index: number;
    is_visible: boolean;
    is_active: boolean;
}

export interface TableSession {
    id: string;
    session_number: string;
    status: TableStatus;
    party_size: number;
    guest_name?: string;
    guest_phone?: string;
    guest_notes?: string;
    order_id?: string;
    server_staff_id?: string;
    seated_at: string;
    current_course: number;
    needs_attention: boolean;
    is_vip: boolean;
    minutes_seated?: number;
    merged_tables?: string[];
}

export interface TableWithSession extends FloorPlanObject {
    session?: TableSession | null;
    next_reservation?: {
        id: string;
        party_name: string;
        party_size: number;
        time: string;
        status: string;
    } | null;
}

export interface FloorPlan {
    id: string;
    name: string;
    description?: string;
    canvas_width: number;
    canvas_height: number;
    grid_size: number;
    background_color: string;
    is_active: boolean;
    is_default: boolean;
    table_count?: number;
    total_capacity?: number;
}

export interface WaitlistEntry {
    id: string;
    party_name: string;
    party_size: number;
    phone?: string;
    status: 'waiting' | 'notified' | 'arrived' | 'seated' | 'no_show' | 'cancelled' | 'expired';
    position: number;
    quoted_wait_minutes: number;
    estimated_ready_at?: string;
    actual_wait_minutes?: number;
    preferred_section?: string;
    seating_preference?: string;
    notes?: string;
    created_at: string;
    notified_at?: string;
    minutes_waiting?: number;
}

export interface Reservation {
    id: string;
    confirmation_number: string;
    party_name: string;
    party_size: number;
    phone: string;
    email?: string;
    reservation_time: string;
    duration_minutes: number;
    end_time?: string;
    status: 'pending' | 'confirmed' | 'reminded' | 'arrived' | 'seated' | 'completed' | 'no_show' | 'cancelled';
    assigned_table_ids?: string[];
    assigned_tables?: string[];
    preferred_section?: string;
    seating_preference?: string;
    notes?: string;
    special_requests?: string;
    is_vip: boolean;
    source: string;
}

// ============================================================================
// STORE STATE
// ============================================================================

interface FloorPlanState {
    // Data
    locationId: string | null;
    floorPlans: FloorPlan[];
    activeFloorPlanId: string | null;
    tables: TableWithSession[];
    waitlist: WaitlistEntry[];
    reservations: Reservation[];

    // UI State
    selectedTableIds: string[];
    isDesignMode: boolean;
    isLoading: boolean;
    error: string | null;
    lastSyncAt: Date | null;

    // Undo/Redo (design mode only)
    past: FloorPlanObject[][];
    future: FloorPlanObject[][];

    // Connection
    isOnline: boolean;
    realtimeChannel: RealtimeChannel | null;

    // Actions
    initialize: (locationId: string) => Promise<void>;
    cleanup: () => void;

    // Floor Plan Actions
    setActiveFloorPlan: (floorPlanId: string) => Promise<void>;
    createFloorPlan: (name: string, description?: string) => Promise<string>;
    loadFloorPlanStatus: () => Promise<void>;

    // Table Design Actions (Design Mode)
    setDesignMode: (enabled: boolean) => void;
    addTable: (tableData: Partial<FloorPlanObject>) => Promise<string>;
    updateTablePosition: (tableId: string, x: number, y: number, rotation?: number) => Promise<void>;
    updateTablePositionsBatch: (updates: Array<{ id: string; x: number; y: number; rotation?: number }>) => Promise<void>;
    removeTable: (tableId: string) => Promise<void>;

    // Table Session Actions (Service Mode)
    seatGuests: (params: {
        tableIds: string[];
        partySize: number;
        guestName?: string;
        guestPhone?: string;
        guestNotes?: string;
        reservationId?: string;
        waitlistId?: string;
        createOrder?: boolean;
    }) => Promise<{ sessionId: string; orderId?: string }>;

    updateSessionStatus: (sessionId: string, status: TableStatus, notes?: string) => Promise<void>;
    transferSession: (sessionId: string, newTableIds: string[]) => Promise<void>;
    mergeTable: (sessionId: string, tableId: string) => Promise<void>;
    unmergeTable: (sessionId: string, tableId: string) => Promise<void>;
    advanceCourse: (sessionId: string) => Promise<void>;
    linkOrderToSession: (sessionId: string, orderId: string) => Promise<void>;

    // Selection Actions
    toggleTableSelection: (tableId: string) => void;
    clearSelection: () => void;
    selectMultipleTables: (tableIds: string[]) => void;

    // Waitlist Actions
    loadWaitlist: () => Promise<void>;
    addToWaitlist: (params: {
        partyName: string;
        partySize: number;
        phone?: string;
        notes?: string;
        preferredSection?: string;
        quotedWaitMinutes?: number;
    }) => Promise<{ waitlistId: string; position: number; quotedWait: number }>;
    notifyWaitlistParty: (waitlistId: string) => Promise<{ phone: string; message: string }>;
    updateWaitlistStatus: (waitlistId: string, status: WaitlistEntry['status']) => Promise<void>;
    seatFromWaitlist: (waitlistId: string, tableIds: string[]) => Promise<{ sessionId: string; orderId?: string }>;

    // Reservation Actions
    loadReservations: (date?: string) => Promise<void>;
    createReservation: (params: {
        partyName: string;
        partySize: number;
        phone: string;
        date: string;
        time: string;
        email?: string;
        notes?: string;
        specialRequests?: string;
        isVip?: boolean;
    }) => Promise<{ reservationId: string; confirmationNumber: string }>;
    updateReservationStatus: (reservationId: string, status: Reservation['status']) => Promise<void>;
    assignReservationTables: (reservationId: string, tableIds: string[]) => Promise<void>;
    seatReservation: (reservationId: string, tableIds?: string[]) => Promise<{ sessionId: string; orderId?: string }>;
    checkAvailability: (date: string, time: string, partySize: number) => Promise<FloorPlanObject[]>;

    // Undo/Redo (design mode)
    undo: () => void;
    redo: () => void;
    saveSnapshot: () => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useFloorPlanStore = create<FloorPlanState>()(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                // Initial State
                locationId: null,
                floorPlans: [],
                activeFloorPlanId: null,
                tables: [],
                waitlist: [],
                reservations: [],
                selectedTableIds: [],
                isDesignMode: false,
                isLoading: false,
                error: null,
                lastSyncAt: null,
                past: [],
                future: [],
                isOnline: true,
                realtimeChannel: null,

                // ====================================================================
                // INITIALIZATION & CLEANUP
                // ====================================================================

                initialize: async (locationId: string) => {
                    set({ isLoading: true, locationId, error: null });
                    const supabase = useSupabaseClient();
                    try {
                        // Load floor plans for location
                        const { data: floorPlans, error: fpError } = await supabase.rpc(
                            'get_location_floor_plans',
                            { p_location_id: locationId }
                        );

                        if (fpError) throw fpError;

                        // Find default or first floor plan
                        const defaultPlan = floorPlans?.find((fp: FloorPlan) => fp.is_default) || floorPlans?.[0];

                        set({
                            floorPlans: floorPlans || [],
                            activeFloorPlanId: defaultPlan?.id || null
                        });

                        // Load status if we have a floor plan
                        if (defaultPlan?.id) {
                            await get().setActiveFloorPlan(defaultPlan.id);
                        }

                        // Load waitlist and reservations
                        await Promise.all([
                            get().loadWaitlist(),
                            get().loadReservations()
                        ]);

                        // Setup realtime subscriptions
                        get().setupRealtimeSubscriptions(locationId);

                        set({ isLoading: false, lastSyncAt: new Date() });
                    } catch (error: any) {
                        set({ isLoading: false, error: error.message });
                        throw error;
                    }
                },

                setupRealtimeSubscriptions: (locationId: string) => {
                    const supabase = useSupabaseClient();
                    // Clean up existing subscription
                    const existingChannel = get().realtimeChannel;
                    if (existingChannel) {
                        supabase.removeChannel(existingChannel);
                    }

                    // Subscribe to table sessions (most frequent updates)
                    const channel = supabase
                        .channel(`floor-plan-${locationId}`)
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'table_sessions',
                                filter: `location_id=eq.${locationId}`
                            },
                            (payload) => {
                                console.log('Table session change:', payload);
                                // Reload floor plan status
                                get().loadFloorPlanStatus();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'table_session_tables'
                            },
                            () => {
                                get().loadFloorPlanStatus();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'waitlist',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                get().loadWaitlist();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'reservations',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                get().loadReservations();
                            }
                        )
                        .on(
                            'postgres_changes',
                            {
                                event: '*',
                                schema: 'public',
                                table: 'floor_plan_objects',
                                filter: `location_id=eq.${locationId}`
                            },
                            () => {
                                // Only reload in design mode or if objects change significantly
                                if (get().isDesignMode) {
                                    get().loadFloorPlanStatus();
                                }
                            }
                        )
                        .subscribe((status) => {
                            set({ isOnline: status === 'SUBSCRIBED' });
                        });

                    set({ realtimeChannel: channel });
                },

                cleanup: () => {
                    const supabase = useSupabaseClient();
                    const channel = get().realtimeChannel;
                    if (channel) {
                        supabase.removeChannel(channel);
                    }
                    set({
                        realtimeChannel: null,
                        locationId: null,
                        floorPlans: [],
                        activeFloorPlanId: null,
                        tables: [],
                        waitlist: [],
                        reservations: []
                    });
                },

                // ====================================================================
                // FLOOR PLAN ACTIONS
                // ====================================================================

                setActiveFloorPlan: async (floorPlanId: string) => {
                    set({ activeFloorPlanId: floorPlanId, isLoading: true });
                    await get().loadFloorPlanStatus();
                    set({ isLoading: false });
                },

                createFloorPlan: async (name: string, description?: string) => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) throw new Error('No location set');

                    const { data, error } = await supabase.rpc('create_floor_plan', {
                        p_location_id: locationId,
                        p_name: name,
                        p_description: description
                    });

                    if (error) throw error;

                    // Reload floor plans
                    const { data: floorPlans } = await supabase.rpc(
                        'get_location_floor_plans',
                        { p_location_id: locationId }
                    );

                    set({ floorPlans: floorPlans || [] });

                    return data.floor_plan_id;
                },

                loadFloorPlanStatus: async () => {
                    const supabase = useSupabaseClient();
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) return;

                    const { data, error } = await supabase.rpc('get_floor_plan_status', {
                        p_floor_plan_id: floorPlanId
                    });

                    if (error) {
                        set({ error: error.message });
                        return;
                    }

                    set({
                        tables: data?.tables || [],
                        lastSyncAt: new Date()
                    });
                },

                // ====================================================================
                // TABLE DESIGN ACTIONS (Design Mode)
                // ====================================================================

                setDesignMode: (enabled: boolean) => {
                    set({ isDesignMode: enabled, selectedTableIds: [] });
                    if (!enabled) {
                        // Clear undo history when exiting design mode
                        set({ past: [], future: [] });
                    }
                },

                addTable: async (tableData: Partial<FloorPlanObject>) => {
                    const supabase = useSupabaseClient();
                    const floorPlanId = get().activeFloorPlanId;
                    if (!floorPlanId) throw new Error('No floor plan selected');

                    get().saveSnapshot();

                    const shape = TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES];

                    const { data, error } = await supabase.rpc('add_floor_plan_object', {
                        p_floor_plan_id: floorPlanId,
                        p_name: tableData.name || `Table ${get().tables.length + 1}`,
                        p_shape_id: tableData.shape_id,
                        p_category: shape?.category || 'table',
                        p_x: tableData.x || 100,
                        p_y: tableData.y || 100,
                        p_rotation: tableData.rotation || 0,
                        p_capacity: shape?.capacity || null,
                        p_width: shape?.width || null,
                        p_height: shape?.height || null
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();

                    return data.object_id;
                },

                updateTablePosition: async (tableId: string, x: number, y: number, rotation?: number) => {
                    const supabase = useSupabaseClient();
                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t =>
                            t.id === tableId ? { ...t, x, y, rotation: rotation ?? t.rotation } : t
                        )
                    }));

                    const { error } = await supabase.rpc('update_floor_plan_object_position', {
                        p_object_id: tableId,
                        p_x: x,
                        p_y: y,
                        p_rotation: rotation
                    });

                    if (error) {
                        // Revert on error
                        await get().loadFloorPlanStatus();
                        throw error;
                    }
                },

                updateTablePositionsBatch: async (updates) => {
                    const supabase = useSupabaseClient();
                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t => {
                            const update = updates.find(u => u.id === t.id);
                            return update ? { ...t, x: update.x, y: update.y, rotation: update.rotation ?? t.rotation } : t;
                        })
                    }));

                    const { error } = await supabase.rpc('update_floor_plan_objects_batch', {
                        p_updates: updates
                    });

                    if (error) {
                        await get().loadFloorPlanStatus();
                        throw error;
                    }
                },

                removeTable: async (tableId: string) => {
                    const supabase = useSupabaseClient();
                    get().saveSnapshot();

                    const { error } = await supabase
                        .from('floor_plan_objects')
                        .delete()
                        .eq('id', tableId);

                    if (error) throw error;

                    set(state => ({
                        tables: state.tables.filter(t => t.id !== tableId),
                        selectedTableIds: state.selectedTableIds.filter(id => id !== tableId)
                    }));
                },

                // ====================================================================
                // TABLE SESSION ACTIONS (Service Mode)
                // ====================================================================

                seatGuests: async (params) => {
                    const supabase = useSupabaseClient();
                    const { data, error } = await supabase.rpc('seat_guests', {
                        p_table_ids: params.tableIds,
                        p_party_size: params.partySize,
                        p_guest_name: params.guestName,
                        p_guest_phone: params.guestPhone,
                        p_guest_notes: params.guestNotes,
                        p_reservation_id: params.reservationId,
                        p_waitlist_id: params.waitlistId,
                        p_create_order: params.createOrder ?? true
                    });

                    if (error) throw error;

                    // Realtime will update, but trigger immediate refresh
                    await get().loadFloorPlanStatus();
                    get().clearSelection();

                    return {
                        sessionId: data.session_id,
                        orderId: data.order_id
                    };
                },

                updateSessionStatus: async (sessionId: string, status: TableStatus, notes?: string) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('update_table_session_status', {
                        p_session_id: sessionId,
                        p_status: status,
                        p_notes: notes
                    });

                    if (error) throw error;

                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t =>
                            t.session?.id === sessionId
                                ? { ...t, session: { ...t.session, status } as TableSession }
                                : t
                        )
                    }));
                },

                transferSession: async (sessionId: string, newTableIds: string[]) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('transfer_table_session', {
                        p_session_id: sessionId,
                        p_new_table_ids: newTableIds
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();
                },

                mergeTable: async (sessionId: string, tableId: string) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('merge_table_to_session', {
                        p_session_id: sessionId,
                        p_table_id: tableId
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();
                },

                unmergeTable: async (sessionId: string, tableId: string) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('unmerge_table_from_session', {
                        p_session_id: sessionId,
                        p_table_id: tableId
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();
                },

                advanceCourse: async (sessionId: string) => {
                    const supabase = useSupabaseClient();
                    const { data, error } = await supabase.rpc('advance_course', {
                        p_session_id: sessionId
                    });

                    if (error) throw error;

                    // Optimistic update
                    set(state => ({
                        tables: state.tables.map(t =>
                            t.session?.id === sessionId
                                ? { ...t, session: { ...t.session, current_course: data.current_course } as TableSession }
                                : t
                        )
                    }));

                    return data;
                },

                linkOrderToSession: async (sessionId: string, orderId: string) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('link_order_to_session', {
                        p_session_id: sessionId,
                        p_order_id: orderId
                    });

                    if (error) throw error;
                },

                // ====================================================================
                // SELECTION ACTIONS
                // ====================================================================

                toggleTableSelection: (tableId: string) => {
                    set(state => ({
                        selectedTableIds: state.selectedTableIds.includes(tableId)
                            ? state.selectedTableIds.filter(id => id !== tableId)
                            : [...state.selectedTableIds, tableId]
                    }));
                },

                clearSelection: () => set({ selectedTableIds: [] }),

                selectMultipleTables: (tableIds: string[]) => set({ selectedTableIds: tableIds }),

                // ====================================================================
                // WAITLIST ACTIONS
                // ====================================================================

                loadWaitlist: async () => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) return;

                    const { data, error } = await supabase.rpc('get_waitlist', {
                        p_location_id: locationId
                    });

                    if (error) {
                        console.error('Failed to load waitlist:', error);
                        return;
                    }

                    set({ waitlist: data?.waitlist || [] });
                },

                addToWaitlist: async (params) => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) throw new Error('No location set');

                    const { data, error } = await supabase.rpc('add_to_waitlist', {
                        p_location_id: locationId,
                        p_party_name: params.partyName,
                        p_party_size: params.partySize,
                        p_phone: params.phone,
                        p_notes: params.notes,
                        p_preferred_section: params.preferredSection,
                        p_quoted_wait_minutes: params.quotedWaitMinutes
                    });

                    if (error) throw error;

                    return {
                        waitlistId: data.waitlist_id,
                        position: data.position,
                        quotedWait: data.quoted_wait_minutes
                    };
                },

                notifyWaitlistParty: async (waitlistId: string) => {
                    const supabase = useSupabaseClient();
                    const { data, error } = await supabase.rpc('notify_waitlist_party', {
                        p_waitlist_id: waitlistId
                    });

                    if (error) throw error;

                    return {
                        phone: data.phone,
                        message: data.message_template
                    };
                },

                updateWaitlistStatus: async (waitlistId: string, status) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('update_waitlist_status', {
                        p_waitlist_id: waitlistId,
                        p_status: status
                    });

                    if (error) throw error;
                },

                seatFromWaitlist: async (waitlistId: string, tableIds: string[]) => {
                    const supabase = useSupabaseClient();
                    const { data, error } = await supabase.rpc('seat_from_waitlist', {
                        p_waitlist_id: waitlistId,
                        p_table_ids: tableIds
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();
                    get().clearSelection();

                    return {
                        sessionId: data.session_id,
                        orderId: data.order_id
                    };
                },

                // ====================================================================
                // RESERVATION ACTIONS
                // ====================================================================

                loadReservations: async (date?: string) => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) return;

                    const { data, error } = await supabase.rpc('get_reservations', {
                        p_location_id: locationId,
                        p_date: date || new Date().toISOString().split('T')[0]
                    });

                    if (error) {
                        console.error('Failed to load reservations:', error);
                        return;
                    }

                    set({ reservations: data?.reservations || [] });
                },

                createReservation: async (params) => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) throw new Error('No location set');

                    const { data, error } = await supabase.rpc('create_reservation', {
                        p_location_id: locationId,
                        p_party_name: params.partyName,
                        p_party_size: params.partySize,
                        p_phone: params.phone,
                        p_reservation_date: params.date,
                        p_reservation_time: params.time,
                        p_email: params.email,
                        p_notes: params.notes,
                        p_special_requests: params.specialRequests,
                        p_is_vip: params.isVip
                    });

                    if (error) throw error;

                    return {
                        reservationId: data.reservation_id,
                        confirmationNumber: data.confirmation_number
                    };
                },

                updateReservationStatus: async (reservationId: string, status) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('update_reservation_status', {
                        p_reservation_id: reservationId,
                        p_status: status
                    });

                    if (error) throw error;
                },

                assignReservationTables: async (reservationId: string, tableIds: string[]) => {
                    const supabase = useSupabaseClient();
                    const { error } = await supabase.rpc('assign_reservation_tables', {
                        p_reservation_id: reservationId,
                        p_table_ids: tableIds
                    });

                    if (error) throw error;

                    await get().loadReservations();
                },

                seatReservation: async (reservationId: string, tableIds?: string[]) => {
                    const supabase = useSupabaseClient();
                    const { data, error } = await supabase.rpc('seat_reservation', {
                        p_reservation_id: reservationId,
                        p_table_ids: tableIds
                    });

                    if (error) throw error;

                    await get().loadFloorPlanStatus();
                    get().clearSelection();

                    return {
                        sessionId: data.session_id,
                        orderId: data.order_id
                    };
                },

                checkAvailability: async (date: string, time: string, partySize: number) => {
                    const supabase = useSupabaseClient();
                    const locationId = get().locationId;
                    if (!locationId) throw new Error('No location set');

                    const { data, error } = await supabase.rpc('check_table_availability', {
                        p_location_id: locationId,
                        p_date: date,
                        p_time: time,
                        p_party_size: partySize
                    });

                    if (error) throw error;

                    return data?.available_tables || [];
                },

                // ====================================================================
                // UNDO/REDO (Design Mode Only)
                // ====================================================================

                saveSnapshot: () => {
                    const tables = get().tables.map(t => {
                        const { session, next_reservation, ...rest } = t;
                        return rest;
                    });

                    set(state => ({
                        past: [...state.past.slice(-19), tables], // Keep last 20
                        future: []
                    }));
                },

                undo: () => {
                    set(state => {
                        if (state.past.length === 0) return state;

                        const previous = state.past[state.past.length - 1];
                        const current = state.tables.map(t => {
                            const { session, next_reservation, ...rest } = t;
                            return rest;
                        });

                        return {
                            tables: previous.map(t => ({ ...t, session: null, next_reservation: null })) as TableWithSession[],
                            past: state.past.slice(0, -1),
                            future: [current, ...state.future]
                        };
                    });
                },

                redo: () => {
                    set(state => {
                        if (state.future.length === 0) return state;

                        const next = state.future[0];
                        const current = state.tables.map(t => {
                            const { session, next_reservation, ...rest } = t;
                            return rest;
                        });

                        return {
                            tables: next.map(t => ({ ...t, session: null, next_reservation: null })) as TableWithSession[],
                            past: [...state.past, current],
                            future: state.future.slice(1)
                        };
                    });
                }
            }),
            {
                name: 'floor-plan-storage',
                storage: createJSONStorage(() => AsyncStorage),
                partialize: (state) => ({
                    // Only persist essential data, not realtime state
                    activeFloorPlanId: state.activeFloorPlanId,
                    isDesignMode: state.isDesignMode
                })
            }
        )
    )
);

// ============================================================================
// SELECTORS (Optimized derived state)
// ============================================================================

export const selectAvailableTables = (state: FloorPlanState) =>
    state.tables.filter(t =>
        (t.category === 'table' || t.category === 'booth') &&
        t.is_active &&
        !t.session
    );

export const selectOccupiedTables = (state: FloorPlanState) =>
    state.tables.filter(t => t.session !== null && t.session !== undefined);

export const selectTablesByStatus = (status: TableStatus) => (state: FloorPlanState) =>
    state.tables.filter(t => t.session?.status === status);

export const selectTablesNeedingAttention = (state: FloorPlanState) =>
    state.tables.filter(t => t.session?.needs_attention);

export const selectActiveWaitlist = (state: FloorPlanState) =>
    state.waitlist.filter(w => ['waiting', 'notified', 'arrived'].includes(w.status));

export const selectUpcomingReservations = (state: FloorPlanState) =>
    state.reservations.filter(r => ['pending', 'confirmed', 'reminded'].includes(r.status));

export const selectFloorPlanSummary = (state: FloorPlanState) => {
    const tables = state.tables.filter(t => t.category === 'table' || t.category === 'booth');
    const available = tables.filter(t => !t.session && t.is_active);
    const occupied = tables.filter(t => t.session);

    return {
        totalTables: tables.length,
        availableTables: available.length,
        occupiedTables: occupied.length,
        totalCapacity: tables.reduce((sum, t) => sum + (t.capacity || 0), 0),
        currentCovers: occupied.reduce((sum, t) => sum + (t.session?.party_size || 0), 0),
        waitlistCount: state.waitlist.filter(w => w.status === 'waiting').length,
        reservationCount: state.reservations.filter(r => ['pending', 'confirmed'].includes(r.status)).length
    };
};