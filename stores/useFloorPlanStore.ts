import { mmkvStorage } from "@/lib/storage";
import { TABLE_SHAPES } from "@/lib/table-shapes";
import { FloorPlanService } from "@/services/floorPlanService";
import { getIsOnline, queueOperation } from "@/services/offlineSyncService";
import {
  FloorPlan,
  FloorPlanObject,
  Reservation,
  TableStatus,
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import type {
  TableSessionPayload
} from '@/types/real-time';
import { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  subscribeWithSelector,
} from "zustand/middleware";
import { useEmployeeStore } from "./useEmployeeStore";

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
  tablesById: Record<string, FloorPlanObject>; // O(1) lookup map
  waitlist: WaitlistEntry[];
  reservations: Reservation[];
  
  // Realtime State
  realtimeStatus: 'connected' | 'reconnecting' | 'disconnected';
  realtimeError: string | null;
  _reconnectAttempts: number;
  _reconnectTimeout: ReturnType<typeof setTimeout> | null;
  _isCleaningUp: boolean;
  _handleSessionChange: (payload: TableSessionPayload) => void;
  _handleReconnect: (locationId: string) => void;
  manualReconnect: () => void;

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
  loadFloorPlanStatusIfStale: (ttlMs?: number) => Promise<void>;

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
    selected_station?: string;
    device_id?: string;
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
  clearTableSession: (tableId: string) => Promise<void>;

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

  // O(1) Getters
  getTableById: (id: string) => FloorPlanObject | undefined;

  // Internal helpers
  _debouncedRefresh: () => void;
}

// Helper to build tablesById map from tables array
// Helper function to rebuild the tablesById lookup map
// Exported for use in other stores that need to update table state
export const buildTablesById = (
  tables: FloorPlanObject[]
): Record<string, FloorPlanObject> => {
  return tables.reduce((acc, table) => {
    acc[table.id] = table;
    return acc;
  }, {} as Record<string, FloorPlanObject>);
};

export const useFloorPlanStore = create<FloorPlanState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        // Initial State
        locationId: null,
        floorPlans: [],
        activeFloorPlanId: null,
        tables: [],
        tablesById: {}, // O(1) lookup map
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

        realtimeStatus: 'disconnected',
        realtimeError: null,
        // ====================================================================
        // SETTER ACTIONS (for external sync)
        // ====================================================================

        setFloorPlans: (floorPlans: FloorPlan[]) => {
          set({ floorPlans });
        },

        setActiveFloorPlanId: (floorPlanId: string | null) => {
          set({ activeFloorPlanId: floorPlanId });
        },

       // setupRealtimeSubscriptions with broadcast messages:
setupRealtimeSubscriptions: async (locationId: string) => {
  const supabase = getClient();
  if (!supabase) return;

  // Clean up existing
  const existingChannel = get().realtimeChannel;
  if (existingChannel) {
    supabase.removeChannel(existingChannel);
  }

  // IMPORTANT: Set auth for private channels
  await supabase.realtime.setAuth();

  const channel = supabase
    .channel(`location:${locationId}:tables`, {
      config: { private: true }, // Use private channel with RLS
    })
    // Listen for session changes (INSERT/UPDATE/DELETE)
    .on('broadcast', { event: 'INSERT' }, (payload) => {
      console.log('[Realtime] Session INSERT:', payload.payload);
      get()._handleSessionChange(payload.payload as TableSessionPayload);
    })
    .on('broadcast', { event: 'UPDATE' }, (payload) => {
      console.log('[Realtime] Session UPDATE:', payload.payload);
      get()._handleSessionChange(payload.payload as TableSessionPayload);
    })
    .on('broadcast', { event: 'DELETE' }, (payload) => {
      console.log('[Realtime] Session DELETE:', payload.payload);
      get()._handleSessionChange(payload.payload as TableSessionPayload);
    })
    // Listen for table assignment changes
    .on('broadcast', { event: 'TABLE_ASSIGNMENT_INSERT' }, (payload) => {
      get()._debouncedRefresh();
    })
    .on('broadcast', { event: 'TABLE_ASSIGNMENT_UPDATE' }, (payload) => {
      get()._debouncedRefresh();
    })
    .on('broadcast', { event: 'TABLE_ASSIGNMENT_DELETE' }, (payload) => {
      get()._debouncedRefresh();
    })
    // Listen for order updates linked to sessions
    .on('broadcast', { event: 'SESSION_ORDER_UPDATE' }, (payload) => {
      // Notify order store if needed
      get()._debouncedRefresh();
    })
    .subscribe((status, err) => {
      console.log('[Realtime] Status:', status, err);
      
      switch (status) {
        case 'SUBSCRIBED':
          set({
            realtimeStatus: 'connected',
            realtimeError: null,
            isOnline: true,
            _reconnectAttempts: 0 // Reset counter on success
          });
          // THROTTLE (Phase 1.3): Only refresh if last refresh was > 2 seconds ago
          const lastSync = get().lastSyncAt;
          const now = Date.now();
          if (!lastSync || now - new Date(lastSync).getTime() > 2000) {
            get().loadFloorPlanStatus();
          } else {
            console.log('[FloorPlanStore] Skipping refresh - last sync was < 2s ago');
          }
          break;
          
        case 'CHANNEL_ERROR':
          set({ 
            realtimeStatus: 'reconnecting',
            realtimeError: err?.message || 'Connection error'
          });
          // Auto-reconnect with backoff
          get()._handleReconnect(locationId);
          break;
          
        case 'TIMED_OUT':
          set({ realtimeStatus: 'reconnecting' });
          get()._handleReconnect(locationId);
          break;
          
        case 'CLOSED':
          set({ realtimeStatus: 'disconnected', isOnline: false });
          // Auto-reconnect on close (unless cleanup was called intentionally)
          if (!get()._isCleaningUp) {
            get()._handleReconnect(locationId);
          }
          break;
      }
    });

  set({ realtimeChannel: channel, locationId });
},

// NEW: Smart session change handler (avoids full refresh when possible)
_handleSessionChange: (payload: TableSessionPayload) => {
  const { operation, data } = payload;
  
  if (operation === 'DELETE' || !data?.session) {
    // Full refresh for deletes (simpler)
    get()._debouncedRefresh();
    return;
  }

  // For INSERT/UPDATE, try to patch local state
  const sessionId = data.session.id;
  const tableIds = data.tables?.map(t => t.table_id) || [];
  
  set((state) => {
    const newTables = state.tables.map((t) => {
      // Check if this table is part of the updated session
      if (tableIds.includes(t.id)) {
        return {
          ...t,
          session: {
            id: sessionId,
            status: data.session.status,
            party_size: data.session.party_size,
            server_user_id: data.session.server_user_id,
            guest_name: data.session.guest_name,
            seated_at: data.session.seated_at,
            current_course: data.session.current_course,
            working_course: data.session.working_course,
            needs_attention: data.session.needs_attention,
            is_vip: data.session.is_vip,
            is_complaint: data.session.is_complaint,
            order_id: data.session.order_id,
            session_number: data.session.session_number,
            table_ids: tableIds,
          },
        };
      }
      // Clear session if table was previously in this session but isn't anymore
      if (t.session?.id === sessionId && !tableIds.includes(t.id)) {
        return { ...t, session: undefined };
      }
      return t;
    });
    
    return {
      tables: newTables,
      tablesById: buildTablesById(newTables),
    };
  });
},

// NEW: Reconnection with exponential backoff
_reconnectAttempts: 0,
_reconnectTimeout: null as ReturnType<typeof setTimeout> | null,
_isCleaningUp: false,

_handleReconnect: (locationId: string) => {
  const maxAttempts = 5;
  const state = get();
  
  if (state._reconnectAttempts >= maxAttempts) {
    console.warn('[Realtime] Max reconnect attempts reached');
    set({ 
      realtimeStatus: 'disconnected',
      realtimeError: 'Connection failed. Tap to retry.'
    });
    return;
  }

  // Clear existing timeout
  if (state._reconnectTimeout) {
    clearTimeout(state._reconnectTimeout);
  }

  // Faster backoff: 0ms (instant), 500ms, 1s, 2s, 4s
  const delay = state._reconnectAttempts === 0 ? 0 : 500 * Math.pow(2, state._reconnectAttempts - 1);
  
  console.log(`[Realtime] Reconnecting in ${delay}ms (attempt ${state._reconnectAttempts + 1})`);
  
  const timeout = setTimeout(async () => {
    set({ _reconnectAttempts: get()._reconnectAttempts + 1 });
    
    // Unsubscribe first (Reddit pattern)
    const channel = get().realtimeChannel;
    if (channel) {
      const supabase = getClient();
      if (supabase) await supabase.removeChannel(channel);
    }
    
    // Re-subscribe
    get().setupRealtimeSubscriptions(locationId);
  }, delay);
  
  set({ _reconnectTimeout: timeout });
},

// NEW: Manual reconnect (for UI button)
manualReconnect: () => {
  const locationId = get().locationId;
  if (!locationId) return;
  
  set({ _reconnectAttempts: 0, realtimeStatus: 'reconnecting' });
  get().setupRealtimeSubscriptions(locationId);
},

        // Add debounced refresh helper (prevents rapid reloads)
        // UPDATED (Phase 1.3): Increased from 300ms to 500ms to reduce refresh frequency
        _debouncedRefresh: (() => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          return () => {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
              useFloorPlanStore.getState().loadFloorPlanStatus();
            }, 500); // Increased from 300ms to 500ms
          };
        })(),

        cleanup: () => {
          set({ _isCleaningUp: true });
          const supabase = getClient();
          const channel = get().realtimeChannel;
          if (channel && supabase) {
            supabase.removeChannel(channel);
          }
          // Clear any pending reconnect timeout
          const timeout = get()._reconnectTimeout;
          if (timeout) {
            clearTimeout(timeout);
          }
          set({
            realtimeChannel: null,
            locationId: null,
            floorPlans: [],
            activeFloorPlanId: null,
            tables: [],
            tablesById: {},
            waitlist: [],
            reservations: [],
            _reconnectAttempts: 0,
            _reconnectTimeout: null,
            _isCleaningUp: false,
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
            set({ tables: [], tablesById: {} });
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
          // console.log("[loadFloorPlanStatus] data", data?.tables);
          const tables = data?.tables || [];
          set({
            tables,
            tablesById: buildTablesById(tables),
            lastSyncAt: new Date().toISOString(),
            error: null,
          });

          // OPTIMIZATION: Prefetch orders for occupied tables in background
          // This warms the cache for faster table view loading
          const occupiedTables = tables.filter((t) => t.session?.order_id);
          const orderIds = occupiedTables
            .map((t) => t.session!.order_id!)
            .filter(Boolean);

          if (orderIds.length > 0) {
            // Use queueMicrotask to defer prefetch without blocking
            queueMicrotask(async () => {
              try {
                // Dynamic import to avoid circular dependency
                const { useOrderStore } = await import("./useOrderStore");
                const { ordersById, ordersByDbId } = useOrderStore.getState();

                // Enhanced filtering with logging
                const uncachedOrderIds = orderIds.filter((id) => {
                  const inLocalCache = ordersById[id];
                  const inDbIdCache = ordersByDbId[id];
                  const cached = inLocalCache || inDbIdCache;

                  if (!cached) {
                    console.log(`[prefetch] Order ${id} not cached, will fetch`);
                  }

                  return !cached;
                });

                if (uncachedOrderIds.length > 0) {
                  console.log(
                    `[prefetch] Fetching ${uncachedOrderIds.length} orders`
                  );
                  await useOrderStore.getState().prefetchOrders(
                    uncachedOrderIds.slice(0, 5)
                  );
                } else {
                  console.log(
                    `[prefetch] All ${orderIds.length} orders already cached`
                  );
                }
              } catch (err) {
                console.error("[prefetch] Failed:", err);
              }
            });
          }
        },

        loadFloorPlanStatusIfStale: async (ttlMs: number = 30000) => {
          const { lastSyncAt, isLoading } = get();

          // Don't refresh if already loading
          if (isLoading) {
            console.log("[loadFloorPlanStatusIfStale] Skipping - already loading");
            return;
          }

          // Check if offline - use cached data
          const isOnline = getIsOnline();
          if (!isOnline) {
            console.log("[loadFloorPlanStatusIfStale] Offline - using cached data");
            return;
          }

          // Check if data is stale
          const isStale =
            !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > ttlMs;

          if (isStale) {
            console.log("[loadFloorPlanStatusIfStale] Data is stale - refreshing");
            await get().loadFloorPlanStatus();
          } else {
            console.log("[loadFloorPlanStatusIfStale] Data is fresh - skipping refresh");
          }
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
          // Optimistic update - sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.map((t) =>
              t.id === tableId
                ? { ...t, x, y, rotation: rotation ?? t.rotation }
                : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });

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
          // Optimistic update - sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.map((t) =>
              t.id === tableId ? { ...t, name } : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });

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
          // Create O(1) lookup map from updates to avoid O(n*m) nested loop
          const updatesById = new Map(updates.map((u) => [u.id, u]));

          // Optimistic update - sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.map((t) => {
              const update = updatesById.get(t.id); // O(1) instead of O(n)
              return update
                ? {
                  ...t,
                  x: update.x,
                  y: update.y,
                  rotation: update.rotation ?? t.rotation,
                }
                : t;
            });
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });

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

          // Sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.filter((t) => t.id !== tableId);
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
              selectedTableIds: state.selectedTableIds.filter(
                (id) => id !== tableId
              ),
            };
          });
        },

        // ====================================================================
        // TABLE SESSION ACTIONS (Service Mode)
        // ====================================================================

        seatGuests: async (params) => {
          const isOnline = getIsOnline();
          const supabase = getClient();

          // 1. Generate local IDs for optimistic update
          const localSessionId = `local_session_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;
          const localOrderId = `local_order_${Date.now()}_${Math.random()
            .toString(36)
            .substring(2, 9)}`;

          // 2. ALWAYS update local state first (optimistic)
          set((state) => {
            const newTables = state.tables.map((t) =>
              params.tableIds.includes(t.id)
                ? {
                  ...t,
                  session: {
                    id: localSessionId,
                    session_number: localSessionId.slice(-6).toUpperCase(),
                    status: "seated" as TableStatus,
                    party_size: params.partySize,
                    guest_name: params.guestName,
                    seated_at: new Date().toISOString(),
                    table_ids: params.tableIds,
                    order_id:
                      params.createOrder !== false ? localOrderId : undefined,
                    current_course: 1,
                    needs_attention: false,
                    is_vip: false,
                  },
                }
                : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });
          get().clearSelection();

          // 3. Try backend if online
          if (isOnline && supabase) {
            try {
              const { data, error } = await FloorPlanService.seatGuests(
                supabase,
                {
                  p_table_ids: params.tableIds,
                  p_party_size: params.partySize,
                  p_guest_name: params.guestName || null,
                  p_guest_phone: params.guestPhone || null,
                  p_guest_notes: params.guestNotes || null,
                  p_reservation_id: params.reservationId || null,
                  p_waitlist_id: params.waitlistId || null,
                  p_create_order: params.createOrder ?? true,
                  p_device_id :params.device_id || null,
                  p_station_id : params.selected_station || null,
                  p_staff_id:
                    useEmployeeStore.getState().loggedInEmployee?.profileId,
                }
              );

              if (!error && data) {
                // Update local state with real backend IDs
                set((state) => {
                  const newTables = state.tables.map((t) =>
                    t.session?.id === localSessionId
                      ? {
                        ...t,
                        session: {
                          ...t.session!,
                          id: data.session_id,
                          order_id: data.order_id,
                        },
                      }
                      : t
                  );
                  return {
                    tables: newTables,
                    tablesById: buildTablesById(newTables),
                  };
                });

                // REMOVED (Phase 2.1): Full refresh - optimistic update already applied
                // Realtime sync will handle any additional changes
                // await get().loadFloorPlanStatus();
                console.log('[SeatGuests] Data Link Order To Session Data', data)

                // PHASE 2: Safety check - ensure bidirectional order-session link
                if (data.order_id) {
                  // Import useOrderStore dynamically to avoid circular dependency
                  const { useOrderStore } = await import("./useOrderStore");
                  const orderStore = useOrderStore.getState();

                  // Find the order by backend UUID or local ID
                  const order = Object.values(orderStore.ordersById).find(
                    (o) => o.db_order_id === data.order_id || o.id === localOrderId
                  );

                  // If order exists and doesn't have session_id set, link them
                  console.log('[SeatGuests] Data Link Order To Session', data)
                  if (order && !order.session_id) {
                    console.log(
                      "[seatGuests] Order missing session_id, establishing bidirectional link"
                    );
                    await orderStore.linkOrderToSession(order.id, data.session_id);
                  }
                }

                return {
                  sessionId: data.session_id,
                  orderId: data.order_id,
                };
              }

              // If there's an error, queue for retry
              if (error) {
                console.error(
                  "[seatGuests] Backend error, queuing for retry:",
                  error
                );
                await queueOperation({
                  type: "seat_guests",
                  params: {
                    tableIds: params.tableIds,
                    guestCount: params.partySize,
                    guestName: params.guestName,
                    guestPhone: params.guestPhone,
                    guestNotes: params.guestNotes,
                    reservationId: params.reservationId,
                    waitlistId: params.waitlistId,
                    createOrder: params.createOrder,
                    localSessionId,
                  },
                  localOrderId: localOrderId,
                });
              }
            } catch (err) {
              console.error("[seatGuests] Exception, queuing for retry:", err);
              await queueOperation({
                type: "seat_guests",
                params: {
                  tableIds: params.tableIds,
                  guestCount: params.partySize,
                  guestName: params.guestName,
                  guestPhone: params.guestPhone,
                  guestNotes: params.guestNotes,
                  reservationId: params.reservationId,
                  waitlistId: params.waitlistId,
                  createOrder: params.createOrder,
                  localSessionId,
                },
                localOrderId: localOrderId,
              });
            }
          } else {
            // 4. Offline - queue for later sync
            console.log("[seatGuests] Offline, queuing operation");
            await queueOperation({
              type: "seat_guests",
              params: {
                tableIds: params.tableIds,
                guestCount: params.partySize,
                guestName: params.guestName,
                guestPhone: params.guestPhone,
                guestNotes: params.guestNotes,
                reservationId: params.reservationId,
                waitlistId: params.waitlistId,
                createOrder: params.createOrder,
                localSessionId,
              },
              localOrderId: localOrderId,
            });
          }

          // Return local IDs so the UI can proceed
          return {
            sessionId: localSessionId,
            orderId: params.createOrder !== false ? localOrderId : undefined,
          };
        },

        updateSessionStatus: async (
          sessionId: string,
          status: TableStatus,
          notes?: string
        ) => {
          const isOnline = getIsOnline();
          const supabase = getClient();

          // 1. ALWAYS update local state first (optimistic)
          console.log(
            "[updateSessionStatus] sessionId & status",
            sessionId,
            status
          );
          set((state) => {
            const newTables = state.tables.map((t) =>
              t.session?.id === sessionId
                ? {
                  ...t,
                  session: { ...t.session!, status },
                }
                : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });

          // 2. Try backend if online
          if (isOnline && supabase) {
            try {
              const p_staff_id =
                useEmployeeStore.getState().loggedInEmployee?.profileId;
              const { error } = await FloorPlanService.updateTableSessionStatus(
                supabase,
                {
                  p_session_id: sessionId,
                  p_status: status,
                  p_notes: notes,
                  p_staff_id,
                }
              );

              if (error) {
                console.error(
                  "[updateSessionStatus] Backend error, queuing:",
                  error
                );
                await queueOperation({
                  type: "update_session_status",
                  params: { sessionId, status, notes },
                  localOrderId: sessionId,
                });
              } else {
                // REMOVED (Phase 2.1): Full refresh - optimistic update already applied
                // Realtime sync will handle any additional changes
                // await get().loadFloorPlanStatus();
              }
            } catch (err) {
              console.error("[updateSessionStatus] Exception, queuing:", err);
              await queueOperation({
                type: "update_session_status",
                params: { sessionId, status, notes },
                localOrderId: sessionId,
              });
            }
          } else {
            // 3. Offline - queue for later
            console.log("[updateSessionStatus] Offline, queuing");
            await queueOperation({
              type: "update_session_status",
              params: { sessionId, status, notes },
              localOrderId: sessionId,
            });
          }
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

          console.log("[unmergeTable] error", error);
          if (error) throw error;

          await get().loadFloorPlanStatus();
        },

        advanceCourse: async (sessionId: string) => {
          const supabase = getClient();
          const p_staff_id =
            useEmployeeStore.getState().loggedInEmployee?.profileId;
          const { data, error } = await FloorPlanService.advanceCourse(
            supabase,
            sessionId,
            p_staff_id
          );

          if (error) throw error;
          if (!data) throw new Error("No data returned from advanceCourse");

          // Optimistic update - sync both tables array and tablesById map
          set((state) => {
            const newTables = state.tables.map((t) =>
              t.session?.id === sessionId
                ? {
                  ...t,
                  session: {
                    ...t.session!,
                    current_course: data.current_course,
                  },
                }
                : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });
        },

        linkOrderToSession: async (sessionId: string, orderId: string) => {
          const supabase = getClient();
          const p_staff_id =
            useEmployeeStore.getState().loggedInEmployee?.profileId;
          const { error } = await supabase.rpc("link_order_to_session", {
            p_session_id: sessionId,
            p_order_id: orderId,
            p_staff_id,
          });
          if (error) throw error;
        },

        // Clear table session locally (used when voiding an order)
        clearTableSession: async (tableId: string) => {
          const isOnline = getIsOnline();
          const supabase = getClient();
          const table = get().tablesById[tableId];
          const sessionId = table?.session?.id;

          // Capture original session for rollback if needed
          const originalSession = table?.session;

          // 1. ALWAYS update local state first (optimistic)
          set((state) => {
            const newTables = state.tables.map((t) =>
              t.id === tableId ? { ...t, session: undefined } : t
            );
            return {
              tables: newTables,
              tablesById: buildTablesById(newTables),
            };
          });

          // 2. Try backend if online and session exists
          if (isOnline && supabase && sessionId) {
            try {
              // End the session by setting status to 'available'
              const p_staff_id =
                useEmployeeStore.getState().loggedInEmployee?.profileId;
              const { error } = await FloorPlanService.updateTableSessionStatus(
                supabase,
                {
                  p_session_id: sessionId,
                  p_status: "available",
                  p_notes: "Order voided",
                  p_staff_id,
                }
              );

              if (error) {
                console.error("[clearTableSession] Backend error:", error);
                // ROLLBACK: Restore original session on backend failure
                set((state) => {
                  const newTables = state.tables.map((t) =>
                    t.id === tableId ? { ...t, session: originalSession } : t
                  );
                  return {
                    tables: newTables,
                    tablesById: buildTablesById(newTables),
                  };
                });
                throw new Error(`Failed to clear session: ${error.message || error}`);
              } else {
                // Success - optimistic update already applied
                // Realtime sync will handle any additional changes
              }
            } catch (err) {
              console.error("[clearTableSession] Exception:", err);
              // ROLLBACK: Restore original session on exception
              set((state) => {
                const newTables = state.tables.map((t) =>
                  t.id === tableId ? { ...t, session: originalSession } : t
                );
                return {
                  tables: newTables,
                  tablesById: buildTablesById(newTables),
                };
              });
              throw err; // Re-throw so caller knows it failed
            }
          }
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
              tablesById: buildTablesById(previous),
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
              tablesById: buildTablesById(next),
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

        // O(1) Getter
        getTableById: (id: string) => get().tablesById[id],
      }),
      {
        name: "floor-plan-db-storage",
        storage: createJSONStorage(() => mmkvStorage),
        partialize: (state) => ({
          floorPlans: state.floorPlans,
          activeFloorPlanId: state.activeFloorPlanId,
          tables: state.tables,
          locationId: state.locationId,
          lastSyncAt: state.lastSyncAt,
        }),
        // Rebuild tablesById map after rehydrating from storage
        onRehydrateStorage: () => (state) => {
          if (state?.tables) {
            state.tablesById = buildTablesById(state.tables);
          }
        },
      }
    )
  )
);
