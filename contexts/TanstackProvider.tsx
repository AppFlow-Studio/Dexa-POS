import { setupTanstackOnlineManager } from "@/lib/network/setupTanstackOnlineManager";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 5, // 5 min default GC (reduced for 134MB Android heap)
      retry: 2,
      // Perf F7 — explicit network behavior instead of library defaults:
      // - offlineFirst: first attempt always fires (offline-first POS serves
      //   cache + fails fast); retries pause while getIsOnline() is false
      //   instead of spinning timeouts against a dead network.
      // - refetchOnReconnect false: reconnect recovery is owned by
      //   useOrderSyncRecovery + the offline sync queue, not a stale-query
      //   stampede (see setupTanstackOnlineManager).
      // - refetchOnWindowFocus false: inert in RN unless focusManager is
      //   wired to AppState; made explicit so wiring it later can't silently
      //   change fetch behavior.
      networkMode: "offlineFirst",
      refetchOnReconnect: false,
      refetchOnWindowFocus: false,
    },
  },
});

interface TanstackProviderProps {
  children: React.ReactNode;
}

export function TanstackProvider({ children }: TanstackProviderProps) {
  React.useEffect(() => {
    setupTanstackOnlineManager();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
