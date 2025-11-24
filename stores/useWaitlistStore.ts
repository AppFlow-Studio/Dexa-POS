import { create } from "zustand";
import { WaitlistEntry } from "@/lib/types"; // Ensure WaitlistEntry is imported from types

interface WaitlistState {
  waitlist: WaitlistEntry[];

  addToWaitlist: (newEntry: Omit<WaitlistEntry, "id" | "arrivalTime">) => void;
  reorderWaitlist: (newWaitlist: WaitlistEntry[]) => void;
  deleteFromWaitlist: (entryId: string) => void;
  removeWaitlistEntry: (entryId: string) => void; // Added for semantic clarity
}

export const useWaitlistStore = create<WaitlistState>((set, get) => ({
  waitlist: [], // Initialize with an empty array as per your instruction

  addToWaitlist: (newEntryData) => {
    const newEntry: WaitlistEntry = {
      ...newEntryData,
      id: `wl_${Date.now()}`, // Generate a unique ID
      arrivalTime: new Date(), // Set current time for arrival
    };
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
