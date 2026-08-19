import { KickedOutModal } from "@/components/auth/KickedOutModal";
import { useSessionKickListener } from "@/hooks/useSessionKickListener";
import React, { createContext, useContext } from "react";

// ============================================================================
// Context for exposing validateSession to the rest of the app
// ============================================================================

interface SessionKickContextValue {
  /** Check if the current session is still valid. Returns false if kicked. */
  validateSession: () => Promise<boolean>;
  /** Whether the device has been kicked from the station. */
  isKicked: boolean;
  /** Call before intentionally ending the session to suppress the kicked-out modal. */
  markVoluntaryLogout: () => void;
}

const SessionKickContext = createContext<SessionKickContextValue>({
  validateSession: async () => true,
  isKicked: false,
  markVoluntaryLogout: () => {},
});

/**
 * Hook to access session validation from anywhere in the app.
 * Useful for guarding critical operations like order creation.
 */
export function useSessionKick(): SessionKickContextValue {
  return useContext(SessionKickContext);
}

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
  const {
    isKicked,
    kickedBy,
    kickReason,
    kickTitle,
    kickMessage,
    countdown,
    acknowledgeKick,
    validateSession,
    markVoluntaryLogout,
  } = useSessionKickListener();

  return (
    <SessionKickContext.Provider value={{ validateSession, isKicked, markVoluntaryLogout }}>
      {children}
      <KickedOutModal
        visible={isKicked}
        kickedBy={kickedBy}
        kickReason={kickReason}
        title={kickTitle}
        message={kickMessage}
        countdown={countdown}
        onAcknowledge={acknowledgeKick}
      />
    </SessionKickContext.Provider>
  );
}
