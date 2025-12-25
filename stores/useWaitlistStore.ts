import { FloorPlanService } from "@/services/floorPlanService";
import {
  AddToWaitlistParams,
  WaitlistEntry,
} from "@/types/db-floor-plan-types";
import { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";

// Global client reference (pattern used by other stores)
let _supabaseClient: SupabaseClient | null = null;

export const setWaitlistSupabaseClient = (client: SupabaseClient | null) => {
  _supabaseClient = client;
};

const getClient = () => {
  if (!_supabaseClient) {
    console.warn(
      "Supabase client not set in useWaitlistStore, some actions may fail."
    );
  }
  return _supabaseClient!;
};

interface WaitlistState {
  waitlist: WaitlistEntry[];
  isLoading: boolean;
  error: string | null;

  // Backend-connected methods
  fetchWaitlist: (locationId: string) => Promise<void>;
  addToWaitlistAsync: (
    params: Omit<AddToWaitlistParams, "p_location_id"> & { locationId: string }
  ) => Promise<void>;
  removeFromWaitlistAsync: (entryId: string) => Promise<void>;
  seatFromWaitlistAsync: (
    entryId: string,
    tableIds: string[]
  ) => Promise<{ session_id: string; order_id?: string } | null>;

  // Local methods (for offline/fallback)
  addToWaitlist: (
    newEntry: Omit<
      WaitlistEntry,
      | "id"
      | "status"
      | "created_at"
      | "position"
      | "quoted_wait_minutes"
      | "location_id"
    > & { quoted_wait_minutes?: number }
  ) => void;
  reorderWaitlist: (newWaitlist: WaitlistEntry[]) => void;
  deleteFromWaitlist: (entryId: string) => void;
  removeWaitlistEntry: (entryId: string) => void;
}

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waitlist: [],
  isLoading: false,
  error: null,

  // --- BACKEND-CONNECTED METHODS ---

  fetchWaitlist: async (locationId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await FloorPlanService.getWaitlist(
        getClient(),
        locationId
      );
      if (error) throw error;

      // Filter to only show "waiting" status entries
      const waitingEntries = (data?.waitlist || []).filter(
        (entry) => entry.status === "waiting"
      );

      set({ waitlist: waitingEntries, isLoading: false });
    } catch (err: any) {
      console.error("Failed to fetch waitlist:", err);
      set({
        error: err.message || "Failed to fetch waitlist",
        isLoading: false,
      });
    }
  },

  addToWaitlistAsync: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await FloorPlanService.addToWaitlist(
        getClient(),
        {
          p_location_id: params.locationId,
          p_party_name: params.p_party_name,
          p_party_size: params.p_party_size,
          p_phone: params.p_phone,
          p_notes: params.p_notes,
          p_quoted_wait_minutes: params.p_quoted_wait_minutes,
        }
      );

      if (error) throw error;

      // Create local entry with the returned data
      const newEntry: WaitlistEntry = {
        id: data?.waitlist_id || `wl_${Date.now()}`,
        location_id: params.locationId,
        status: "waiting",
        created_at: new Date().toISOString(),
        position: data?.position || get().waitlist.length + 1,
        quoted_wait_minutes:
          data?.quoted_wait_minutes || params.p_quoted_wait_minutes || 15,
        party_name: params.p_party_name,
        party_size: params.p_party_size,
        phone: params.p_phone,
        notes: params.p_notes,
      };

      set((state) => ({
        waitlist: [...state.waitlist, newEntry],
        isLoading: false,
      }));
    } catch (err: any) {
      console.error("Failed to add to waitlist:", err);
      set({
        error: err.message || "Failed to add to waitlist",
        isLoading: false,
      });

      // Fallback: add locally anyway for offline support
      get().addToWaitlist({
        party_name: params.p_party_name,
        party_size: params.p_party_size,
        phone: params.p_phone,
        notes: params.p_notes,
        quoted_wait_minutes: params.p_quoted_wait_minutes,
      });
    }
  },

  removeFromWaitlistAsync: async (entryId: string) => {
    try {
      const { error } = await FloorPlanService.updateWaitlistStatus(
        getClient(),
        entryId,
        "cancelled"
      );

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        waitlist: state.waitlist.filter((entry) => entry.id !== entryId),
      }));
    } catch (err: any) {
      console.error("Failed to remove from waitlist:", err);
      // Still remove locally for UX
      set((state) => ({
        waitlist: state.waitlist.filter((entry) => entry.id !== entryId),
      }));
    }
  },

  seatFromWaitlistAsync: async (entryId: string, tableIds: string[]) => {
    try {
      const { data, error } = await FloorPlanService.seatFromWaitlist(
        getClient(),
        entryId,
        tableIds
      );

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        waitlist: state.waitlist.filter((entry) => entry.id !== entryId),
      }));

      return data;
    } catch (err: any) {
      console.error("Failed to seat from waitlist:", err);
      // Still remove locally
      set((state) => ({
        waitlist: state.waitlist.filter((entry) => entry.id !== entryId),
      }));
      return null;
    }
  },

  // --- LOCAL METHODS (for offline/fallback) ---

  addToWaitlist: (newEntryData) => {
    const newEntry: WaitlistEntry = {
      id: `wl_${Date.now()}`,
      location_id: "loc_demo",
      status: "waiting",
      created_at: new Date().toISOString(),
      position: get().waitlist.length + 1,
      quoted_wait_minutes: newEntryData.quoted_wait_minutes || 15,
      ...newEntryData,
    };

    if (!newEntry.party_size) newEntry.party_size = 2;
    if (!newEntry.party_name) newEntry.party_name = "Guest";

    set((state) => ({
      waitlist: [...state.waitlist, newEntry],
    }));
  },

  reorderWaitlist: (newWaitlist) => {
    set({ waitlist: newWaitlist });
  },

  deleteFromWaitlist: (entryId) => {
    set((state) => ({
      waitlist: state.waitlist.filter((entry) => entry.id !== entryId),
    }));
  },

  removeWaitlistEntry: (entryId) => {
    get().deleteFromWaitlist(entryId);
  },
}));
