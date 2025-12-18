import { WaitlistEntry } from "@/types/db-floor-plan-types";
import { create } from "zustand";

interface WaitlistState {
  waitlist: WaitlistEntry[];

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
  removeWaitlistEntry: (entryId: string) => void; // Added for semantic clarity
}

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waitlist: [], // Initialize with an empty array as per your instruction

  addToWaitlist: (newEntryData) => {
    const newEntry: WaitlistEntry = {
      id: `wl_${Date.now()}`, // Generate a unique ID
      location_id: "loc_demo", // Mock location
      status: "waiting",
      created_at: new Date().toISOString(),
      position: get().waitlist.length + 1,
      quoted_wait_minutes: newEntryData.quoted_wait_minutes || 15, // Default quote
      ...newEntryData,
    };

    // Ensure required fields
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

  // Alias for deleteFromWaitlist for semantic clarity when seating a customer
  removeWaitlistEntry: (entryId) => {
    get().deleteFromWaitlist(entryId);
  },
}));
