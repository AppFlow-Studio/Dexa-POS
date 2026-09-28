import { create } from "zustand";

/**
 * What the connection card on every handheld page shows:
 *   - online: nothing
 *   - offline: no network ("You're offline")
 *   - reconnecting: the network is up but live updates are not
 */
export type ConnectionState = "online" | "offline" | "reconnecting";

interface ConnectionStore {
  state: ConnectionState;
  set: (state: ConnectionState) => void;
}

/**
 * Written only by `useConnectionWatcher` (mounted once, in HandheldFrame),
 * read by every page's `OfflineBanner`. One grace timer for the whole app —
 * a timer per banner would hide the card for the grace period on every page
 * pushed while offline.
 */
export const useConnectionStore = create<ConnectionStore>((set) => ({
  state: "online",
  set: (state) => set({ state }),
}));
