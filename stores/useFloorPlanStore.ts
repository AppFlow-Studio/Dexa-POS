import { TABLE_SHAPES } from "@/lib/table-shapes";
import { FloorPlanService } from "@/services/floorPlanService";
import {
  FloorPlan,
  FloorPlanObject,
  Reservation,
  TableStatus,
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { 
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";

// Global client reference to avoid direct dependency loops or hook usage outside components
let _supabaseClient: SupabaseClient | null = null;

export const setFloorPlanSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      "Supabase client not set in useFloorPlanStore, some actions may fail."
    );
  }
  return _supabaseClient!;
};

interface FloorPlanState {
  // Data
  locationId: string | null;
  floorPlans: FloorPlan[];
  activeFloorPlanId: string | null;
  tables: FloorPlanObject[];
  waitlist: WaitlistEntry[];
  reservations: Reservation[];

  // UI State
  selectedTableIds: string[];
  isDesignMode: boolean;
  isLoading: boolean;
  error: string | null;
  lastSyncAt: string | null; // ISO string for persistence

  // Undo/Redo (design mode only)
  past: FloorPlanObject[][];
  future: FloorPlanObject[][];

  // Connection
  isOnline: boolean;
  realtimeChannel: RealtimeChannel | null;

  // Actions
  setFloorPlans: (floorPlans: FloorPlan[]) => void;
  setActiveFloorPlanId: (floorPlanId: string | null) => void;
  cleanup: () => void;
  setupRealtimeSubscriptions: (locationId: string) => void;

  // Floor Plan Actions
  setActiveFloorPlan: (floorPlanId: string) => Promise<void>;
  createFloorPlan: (name: string, description?: string) => Promise<string>;
  updateFloorPlan: (id: string, name: string) => Promise<void>;
  deleteFloorPlan: (id: string) => Promise<void>;
  loadFloorPlanStatus: () => Promise<void>;

  // Table Design Actions (Design Mode)
  setDesignMode: (enabled: boolean) => void;
  addTable: (tableData: Partial<FloorPlanObject>) => Promise<string>;
  updateTablePosition: (
    tableId: string,
    x: number,
    y: number,
    rotation?: number
  ) => Promise<void>;
  updateTableName: (tableId: string, name: string) => Promise<void>; // Added
  updateTablePositionsBatch: (
    updates: Array<{ id: string; x: number; y: number; rotation?: number }>
  ) => Promise<void>;
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

  updateSessionStatus: (
    sessionId: string,
    status: TableStatus,
    notes?: string
  ) => Promise<void>;
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
  notifyWaitlistParty: (
    waitlistId: string
  ) => Promise<{ phone: string; message: string }>;
  updateWaitlistStatus: (waitlistId: string, status: string) => Promise<void>;
  seatFromWaitlist: (
    waitlistId: string,
    tableIds: string[]
  ) => Promise<{ sessionId: string; orderId?: string }>;

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
  updateReservationStatus: (
    reservationId: string,
    status: Reservation["status"]
  ) => Promise<void>;
  assignReservationTables: (
    reservationId: string,
    tableIds: string[]
  ) => Promise<void>;
  seatReservation: (
    reservationId: string,
    tableIds?: string[]
  ) => Promise<{ sessionId: string; orderId?: string }>;
  checkAvailability: (
    date: string,
    time: string,
    partySize: number
  ) => Promise<FloorPlanObject[]>;

  // Undo/Redo (design mode)
  undo: () => void;
  redo: () => void;
  saveSnapshot: () => void;
}

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
        // SETTER ACTIONS (for external sync)
        // ====================================================================

        setFloorPlans: (floorPlans: FloorPlan[]) => {
          set({ floorPlans });
        },

        setActiveFloorPlanId: (floorPlanId: string | null) => {
          set({ activeFloorPlanId: floorPlanId });
        },

        // ====================================================================
        // REALTIME SUBSCRIPTIONS
        // ====================================================================

        setupRealtimeSubscriptions: async (locationId: string) => {
          const supabase = getClient();
          await supabase.realtime.setAuth() // Needed for Realtime Authorization
          if (!supabase) return;

          // Clean up existing subscription
          const existingChannel = get().realtimeChannel;
          if (existingChannel) {
            supabase.removeChannel(existingChannel);
          }

          // Subscribe to table sessions (most frequent updates)
          console.log('[setupRealtimeSubscriptions] ', locationId)
          const channel = supabase
            .channel(`floor-plan-${locationId}`)
            .on(
              "broadcast",
              {
                event: "*",
                // schema: "public",
                // table: "table_sessions",
                // filter: `location_id=eq.${locationId}`,
              },
              (payload) => {
                console.log("Table session change:", payload);
                // Reload floor plan status
                get().loadFloorPlanStatus();
              }
            )
            // .on(
            //   "postgres_changes",
            //   {
            //     event: "*",
            //     schema: "public",
            //     table: "table_session_tables",
            //   },
            //   () => {
            //     get().loadFloorPlanStatus();
            //   }
            // )
            // .on(
            //   "postgres_changes",
            //   {
            //     event: "*",
            //     schema: "public",
            //     table: "waitlist",
            //     filter: `location_id=eq.${locationId}`,
            //   },
            //   () => {
            //     get().loadWaitlist();
            //   }
            // )
            // .on(
            //   "postgres_changes",
            //   {
            //     event: "*",
            //     schema: "public",
            //     table: "reservations",
            //     filter: `location_id=eq.${locationId}`,
            //   },
            //   () => {
            //     get().loadReservations();
            //   }
            // )
            // .on(
            //   "postgres_changes",
            //   {
            //     event: "*",
            //     schema: "public",
            //     table: "floor_plan_objects",
            //     filter: `location_id=eq.${locationId}`,
            //   },
            //   () => {
            //     // Only reload in design mode or if objects change significantly
            //     if (get().isDesignMode) {
            //       get().loadFloorPlanStatus();
            //     }
            //   }
            // )
            .subscribe((status) => {
              set({ isOnline: status === "SUBSCRIBED" });
            });

          set({ realtimeChannel: channel });
          return true
        },

        cleanup: () => {
          const supabase = getClient();
          const channel = get().realtimeChannel;
          if (channel && supabase) {
            supabase.removeChannel(channel);
          }
          set({
            realtimeChannel: null,
            locationId: null,
            floorPlans: [],
            activeFloorPlanId: null,
            tables: [],
            waitlist: [],
            reservations: [],
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
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.createFloorPlan(
            supabase,
            {
              p_location_id: locationId,
              p_name: name,
              p_description: description,
            }
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to create floor plan");

          // Reload floor plans
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);

          set({ floorPlans: floorPlans || [] });

          return data.floor_plan_id;
        },

        updateFloorPlan: async (id: string, name: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) return;

          const { error } = await FloorPlanService.updateFloorPlan(
            supabase,
            id,
            { name }
          );
          if (error) throw error;

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);
          set({ floorPlans: floorPlans || [] });
        },

        deleteFloorPlan: async (id: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) return;

          const { error } = await FloorPlanService.deleteFloorPlan(
            supabase,
            id
          );
          if (error) throw error;

          // Reload
          const { data: floorPlans } =
            await FloorPlanService.getLocationFloorPlans(supabase, locationId);

          const newPlans = floorPlans || [];
          const isActive = get().activeFloorPlanId === id;

          set({
            floorPlans: newPlans,
            activeFloorPlanId: isActive
              ? newPlans[0]?.id || null
              : get().activeFloorPlanId,
          });

          if (isActive && newPlans.length > 0) {
            get().setActiveFloorPlan(newPlans[0].id);
          } else if (newPlans.length === 0) {
            set({ tables: [] });
          }
        },

        loadFloorPlanStatus: async () => {
          const supabase = getClient();
          const floorPlanId = get().activeFloorPlanId;
          if (!floorPlanId || !supabase) return;

          const { data, error } = await FloorPlanService.getFloorPlanStatus(
            supabase,
            floorPlanId
          );

          if (error) {
            set({ error: error.message });
            return;
          }
          console.log('[]', data?.tables)
          set({
            tables: data?.tables || [],
            lastSyncAt: new Date().toISOString(),
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
          const supabase = getClient();
          const floorPlanId = get().activeFloorPlanId;
          if (!floorPlanId) throw new Error("No floor plan selected");

          get().saveSnapshot();

          const shape =
            TABLE_SHAPES[tableData.shape_id as keyof typeof TABLE_SHAPES];

          const { data, error } = await FloorPlanService.addFloorPlanObject(
            supabase,
            {
              p_floor_plan_id: floorPlanId,
              p_name: tableData.name || `Table ${get().tables.length + 1}`,
              p_shape_id: tableData.shape_id || "square-4",
              p_category: (shape?.category as any) || "table",
              p_x: tableData.x || 100,
              p_y: tableData.y || 100,
              p_rotation: tableData.rotation || 0,
              p_capacity: shape?.capacity ?? undefined,
              p_width: shape?.width ?? undefined,
              p_height: shape?.height ?? undefined,
            }
          );

          if (error) throw error;
          if (!data) throw new Error("No object_id returned");

          await get().loadFloorPlanStatus();

          return data.object_id;
        },

        updateTablePosition: async (
          tableId: string,
          x: number,
          y: number,
          rotation?: number
        ) => {
          const supabase = getClient();
          // Optimistic update
          set((state) => ({
            tables: state.tables.map((t) =>
              t.id === tableId
                ? { ...t, x, y, rotation: rotation ?? t.rotation }
                : t
            ),
          }));

          const { error } =
            await FloorPlanService.updateFloorPlanObjectPosition(supabase, {
              p_object_id: tableId,
              p_x: x,
              p_y: y,
              p_rotation: rotation,
            });

          if (error) {
            // Revert on error
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTableName: async (tableId: string, name: string) => {
          const supabase = getClient();
          // Optimistic update
          set((state) => ({
            tables: state.tables.map((t) =>
              t.id === tableId ? { ...t, name } : t
            ),
          }));

          const { error } = await FloorPlanService.updateFloorPlanObject(
            supabase,
            tableId,
            { name } // Assuming 'name' column exists and is updateable
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        updateTablePositionsBatch: async (updates) => {
          const supabase = getClient();
          // Optimistic update
          set((state) => ({
            tables: state.tables.map((t) => {
              const update = updates.find((u) => u.id === t.id);
              return update
                ? {
                  ...t,
                  x: update.x,
                  y: update.y,
                  rotation: update.rotation ?? t.rotation,
                }
                : t;
            }),
          }));

          const { error } = await FloorPlanService.updateFloorPlanObjectsBatch(
            supabase,
            {
              p_updates: updates,
            }
          );

          if (error) {
            await get().loadFloorPlanStatus();
            throw error;
          }
        },

        removeTable: async (tableId: string) => {
          const supabase = getClient();
          get().saveSnapshot();

          const { error } = await FloorPlanService.deleteFloorPlanObject(
            supabase,
            tableId
          );

          if (error) throw error;

          set((state) => ({
            tables: state.tables.filter((t) => t.id !== tableId),
            selectedTableIds: state.selectedTableIds.filter(
              (id) => id !== tableId
            ),
          }));
        },

        // ====================================================================
        // TABLE SESSION ACTIONS (Service Mode)
        // ====================================================================

        seatGuests: async (params) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.seatGuests(supabase, {
            p_table_ids: params.tableIds,
            p_party_size: params.partySize,
            p_guest_name: params.guestName,
            p_guest_phone: params.guestPhone,
            p_guest_notes: params.guestNotes,
            p_reservation_id: params.reservationId,
            p_waitlist_id: params.waitlistId,
            p_create_order: params.createOrder ?? true,
          });

          if (error) throw error;
          if (!data) throw new Error("No session created");

          // Realtime will update, but trigger immediate refresh
          await get().loadFloorPlanStatus();
          get().clearSelection();

          return {
            sessionId: data.session_id,
            orderId: data.order_id,
          };
        },

        updateSessionStatus: async (
          sessionId: string,
          status: TableStatus,
          notes?: string
        ) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.updateTableSessionStatus(
            supabase,
            {
              p_session_id: sessionId,
              p_status: status,
              p_notes: notes,
            }
          );

          if (error) throw error;

          // Optimistic update
          set((state) => ({
            tables: state.tables.map((t) =>
              t.session?.id === sessionId
                ? {
                  ...t,
                  session: { ...t.session!, status },
                }
                : t
            ),
          }));
        },

        transferSession: async (sessionId: string, newTableIds: string[]) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.transferTableSession(
            supabase,
            {
              p_session_id: sessionId,
              p_new_table_ids: newTableIds,
            }
          );

          if (error) throw error;

          await get().loadFloorPlanStatus();
        },

        mergeTable: async (sessionId: string, tableId: string) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.mergeTableToSession(
            supabase,
            {
              p_session_id: sessionId,
              p_table_id: tableId,
            }
          );

          if (error) throw error;

          await get().loadFloorPlanStatus();
        },

        unmergeTable: async (sessionId: string, tableId: string) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.unmergeTableFromSession(
            supabase,
            {
              p_session_id: sessionId,
              p_table_id: tableId,
            }
          );

          if (error) throw error;

          await get().loadFloorPlanStatus();
        },

        advanceCourse: async (sessionId: string) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.advanceCourse(
            supabase,
            sessionId
          );

          if (error) throw error;
          if (!data) throw new Error("No data returned from advanceCourse");

          // Optimistic update
          set((state) => ({
            tables: state.tables.map((t) =>
              t.session?.id === sessionId
                ? {
                  ...t,
                  session: {
                    ...t.session!,
                    current_course: data.current_course,
                  },
                }
                : t
            ),
          }));
        },

        linkOrderToSession: async (sessionId: string, orderId: string) => {
          const supabase = getClient();
          const { error } = await supabase.rpc("link_order_to_session", {
            p_session_id: sessionId,
            p_order_id: orderId,
          });
          if (error) throw error;
        },

        // ====================================================================
        // SELECTION ACTIONS
        // ====================================================================

        toggleTableSelection: (tableId: string) => {
          set((state) => ({
            selectedTableIds: state.selectedTableIds.includes(tableId)
              ? state.selectedTableIds.filter((id) => id !== tableId)
              : [...state.selectedTableIds, tableId],
          }));
        },

        clearSelection: () => set({ selectedTableIds: [] }),

        selectMultipleTables: (tableIds: string[]) =>
          set({ selectedTableIds: tableIds }),

        // ====================================================================
        // WAITLIST ACTIONS
        // ====================================================================

        loadWaitlist: async () => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId || !supabase) return;

          const { data, error } = await FloorPlanService.getWaitlist(
            supabase,
            locationId
          );

          if (error) {
            console.error("Failed to load waitlist:", error);
            return;
          }

          set({ waitlist: data?.waitlist || [] });
        },

        addToWaitlist: async (params) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.addToWaitlist(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_notes: params.notes,
              p_preferred_section: params.preferredSection,
              p_quoted_wait_minutes: params.quotedWaitMinutes,
            }
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to add to waitlist");

          return {
            waitlistId: data.waitlist_id,
            position: data.position,
            quotedWait: data.quoted_wait_minutes,
          };
        },

        notifyWaitlistParty: async (waitlistId: string) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.notifyWaitlistParty(
            supabase,
            waitlistId
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to notify");

          return {
            phone: data.phone,
            message: data.message_template,
          };
        },

        updateWaitlistStatus: async (waitlistId: string, status: string) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.updateWaitlistStatus(
            supabase,
            waitlistId,
            status
          );

          if (error) throw error;
        },

        seatFromWaitlist: async (waitlistId: string, tableIds: string[]) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.seatFromWaitlist(
            supabase,
            waitlistId,
            tableIds
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to seat from waitlist");

          await get().loadFloorPlanStatus();
          get().clearSelection();

          return {
            sessionId: data.session_id,
            orderId: data.order_id,
          };
        },

        // ====================================================================
        // RESERVATION ACTIONS
        // ====================================================================

        loadReservations: async (date?: string) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId || !supabase) return;

          const { data, error } = await FloorPlanService.getReservations(
            supabase,
            locationId,
            date
          );

          if (error) {
            console.error("Failed to load reservations:", error);
            return;
          }

          set({ reservations: data?.reservations || [] });
        },

        createReservation: async (params) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.createReservation(
            supabase,
            {
              p_location_id: locationId,
              p_party_name: params.partyName,
              p_party_size: params.partySize,
              p_phone: params.phone,
              p_date: params.date,
              p_time: params.time,
              p_email: params.email,
              p_notes: params.notes,
              p_special_requests: params.specialRequests,
              p_is_vip: params.isVip,
            }
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to create reservation");

          return {
            reservationId: data.reservation_id,
            confirmationNumber: data.confirmation_number,
          };
        },

        updateReservationStatus: async (reservationId, status) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.updateReservationStatus(
            supabase,
            reservationId,
            status
          );

          if (error) throw error;
        },

        assignReservationTables: async (reservationId, tableIds) => {
          const supabase = getClient();
          const { error } = await FloorPlanService.assignReservationTables(
            supabase,
            reservationId,
            tableIds
          );

          if (error) throw error;
        },

        seatReservation: async (reservationId, tableIds) => {
          const supabase = getClient();
          const { data, error } = await FloorPlanService.seatReservation(
            supabase,
            reservationId,
            tableIds
          );

          if (error) throw error;
          if (!data) throw new Error("Failed to seat reservation");

          await get().loadFloorPlanStatus();

          return {
            sessionId: data.session_id,
            orderId: data.order_id,
          };
        },

        checkAvailability: async (date, time, partySize) => {
          const supabase = getClient();
          const locationId = get().locationId;
          if (!locationId) throw new Error("No location set");

          const { data, error } = await FloorPlanService.checkTableAvailability(
            supabase,
            {
              p_location_id: locationId,
              p_date: date,
              p_time: time,
              p_party_size: partySize,
            }
          );

          if (error) throw error;
          return data || [];
        },

        // ====================================================================
        // HISTORY (Design Mode)
        // ====================================================================

        undo: () => {
          set((state) => {
            if (state.past.length === 0) return state;
            const previous = state.past[state.past.length - 1];
            const newPast = state.past.slice(0, -1);
            return {
              tables: previous,
              past: newPast,
              future: [state.tables, ...state.future],
            };
          });
        },

        redo: () => {
          set((state) => {
            if (state.future.length === 0) return state;
            const next = state.future[0];
            const newFuture = state.future.slice(1);
            return {
              tables: next,
              past: [...state.past, state.tables],
              future: newFuture,
            };
          });
        },

        saveSnapshot: () => {
          set((state) => ({
            past: [...state.past, state.tables],
            future: [],
          }));
        },
      }),
      {
        name: "floor-plan-db-storage",
        storage: createJSONStorage(() => AsyncStorage),
        partialize: (state) => ({
          floorPlans: state.floorPlans,
          activeFloorPlanId: state.activeFloorPlanId,
          tables: state.tables,
          locationId: state.locationId,
          lastSyncAt: state.lastSyncAt,
        }),
      }
    )
  )
);
