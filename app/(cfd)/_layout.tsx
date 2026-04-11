import { CFDErrorBoundary } from "@/components/cfd-client/CFDErrorBoundary";
import { CFDClientProvider } from "@/contexts/CFDClientContext";
import { useCFDWSClient } from "@/hooks/useCFDWSClient";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";

// Inner component so that `useCFDWSClient()` (which can throw synchronously
// on malformed pairing data or network-constructor errors) runs INSIDE the
// error boundary. If we called it in CFDLayout directly, the throw would
// bubble above the boundary and still produce a white screen.
function CFDLayoutInner() {
  const cfdClient = useCFDWSClient();

  return (
    <CFDClientProvider value={cfdClient}>
      <StatusBar hidden />
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
        }}
      />
    </CFDClientProvider>
  );
}

export default function CFDLayout() {
  // Keep screen awake in CFD mode
  useEffect(() => {
    activateKeepAwakeAsync("cfd-display").catch(() => {
      // expo-keep-awake may not be available in all envs
    });
  }, []);

  return (
    <CFDErrorBoundary>
      <CFDLayoutInner />
    </CFDErrorBoundary>
  );
}
