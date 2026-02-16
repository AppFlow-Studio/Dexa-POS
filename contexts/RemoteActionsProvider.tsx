import { useRemoteActionsListener } from "@/hooks/useRemoteActionsListener";
import React from "react";

/**
 * Provider that activates remote device action listening.
 * Side-effect only - no context value exposed.
 *
 * Place inside SessionKickListenerProvider, around CFDProvider.
 */
export function RemoteActionsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useRemoteActionsListener();
  return <>{children}</>;
}
