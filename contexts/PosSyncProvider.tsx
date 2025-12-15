import { usePosSync } from "@/hooks/pos/usePosSync";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useEffect } from "react";

// Debug server URL - use your machine's local IP (run: ipconfig getifaddr en0)
// Change this IP to match your machine's IP address
const DEBUG_SERVER_URL = __DEV__
  ? "http://192.168.29.134:3456/debug/sync-data"
  : null;

/**
 * Component that handles POS sync logic.
 * Must be rendered inside ClerkProvider since it uses authenticated Supabase calls.
 */
export function PosSyncProvider({ children }: { children: React.ReactNode }) {
  // POS Sync Integration - Centralized sync for the entire app
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const setMenuData = useMenuStore((state) => state.setMenuData);
  const setSyncState = useMenuStore((state) => state.setSyncState);

  // Fetch menu data from API when store is selected
  const {
    data: posSyncData,
    isLoading: isSyncing,
    isError: isSyncError,
    error: syncError,
  } = usePosSync(selectedStore?.id ?? null);

  // Update menu store when sync data changes
  useEffect(() => {
    if (posSyncData) {
      console.log("POS Sync Data received!");
      console.log("Menus count:", posSyncData.menus?.length || 0);

      // Send to debug server in development (run: node scripts/debug-server.js)
      if (DEBUG_SERVER_URL) {
        fetch(DEBUG_SERVER_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(posSyncData),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              console.log("✅ Sync data sent to debug server:", result.path);
            }
          })
          .catch((err) => {
            // Debug server not running - that's fine
            console.log("Debug server not running (optional):", err.message);
          });
      }

      setMenuData(posSyncData);
    }
  }, [posSyncData, setMenuData]);

  // Update sync state in store
  useEffect(() => {
    setSyncState({
      isLoading: isSyncing,
      isError: isSyncError,
      error: syncError instanceof Error ? syncError : null,
    });
  }, [isSyncing, isSyncError, syncError, setSyncState]);

  return <>{children}</>;
}
