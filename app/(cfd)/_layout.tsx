import { CFDClientProvider } from "@/contexts/CFDClientContext";
import { useCFDWSClient } from "@/hooks/useCFDWSClient";
import { Stack } from "expo-router";
import { activateKeepAwakeAsync } from "expo-keep-awake";
import React, { useEffect } from "react";
import { StatusBar } from "expo-status-bar";

export default function CFDLayout() {
  // Initialize WS client (connects on mount if paired)
  const cfdClient = useCFDWSClient();

  // Keep screen awake in CFD mode
  useEffect(() => {
    activateKeepAwakeAsync("cfd-display").catch(() => {
      // expo-keep-awake may not be available in all envs
    });
  }, []);

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
