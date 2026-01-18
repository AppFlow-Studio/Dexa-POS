import { KickedOutModal } from "@/components/auth/KickedOutModal";
import { useSessionKickListener } from "@/hooks/useSessionKickListener";
import React from "react";

/**
 * Provider component that wraps the app and listens for session kick notifications.
 * When a kick notification is received, it shows a modal with countdown before logout.
 *
 * This should be placed inside the ClerkProvider and TanstackProvider context
 * so it has access to the Supabase client.
 */
export function SessionKickListenerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isKicked, kickedBy, kickReason, countdown, acknowledgeKick } =
    useSessionKickListener();

  return (
    <>
      {children}
      <KickedOutModal
        visible={isKicked}
        kickedBy={kickedBy}
        kickReason={kickReason}
        countdown={countdown}
        onAcknowledge={acknowledgeKick}
      />
    </>
  );
}
