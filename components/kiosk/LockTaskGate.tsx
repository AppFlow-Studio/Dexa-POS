import { AdminPinModal } from "@/components/kiosk/AdminPinModal";
import { exitLockTask, enterLockTask } from "@/native/kiosk/LockTask";
import * as Sentry from "@sentry/react-native";
import React, { useCallback, useEffect, useState } from "react";

export function LockTaskGate({
  adminPinHash,
  children,
  onShowDiagnostics,
}: {
  adminPinHash: string | null | undefined;
  children: (openAdminPin: () => void) => React.ReactNode;
  onShowDiagnostics: () => void;
}) {
  const [showPin, setShowPin] = useState(false);

  useEffect(() => {
    let mounted = true;
    enterLockTask()
      .then((entered) => {
        if (!mounted) return;
        Sentry.addBreadcrumb({
          category: "kiosk.lock_task",
          level: "info",
          message: entered ? "Entered lock task" : "Lock task unavailable",
        });
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { source: "kiosk_lock_task", op: "enter" },
        });
      });

    return () => {
      mounted = false;
      exitLockTask()
        .then((exited) => {
          Sentry.addBreadcrumb({
            category: "kiosk.lock_task",
            level: "info",
            message: exited ? "Exited lock task on unmount" : "Lock task exit unavailable",
          });
        })
        .catch((error) => {
          Sentry.captureException(error, {
            tags: { source: "kiosk_lock_task", op: "exit_unmount" },
          });
        });
    };
  }, []);

  const openAdminPin = useCallback(() => setShowPin(true), []);

  const handleVerified = useCallback(() => {
    setShowPin(false);
    exitLockTask()
      .then((exited) => {
        Sentry.addBreadcrumb({
          category: "kiosk.lock_task",
          level: "info",
          message: exited ? "Exited lock task by admin PIN" : "Lock task exit unavailable",
        });
        onShowDiagnostics();
      })
      .catch((error) => {
        Sentry.captureException(error, {
          tags: { source: "kiosk_lock_task", op: "exit_admin" },
        });
      });
  }, [onShowDiagnostics]);

  return (
    <>
      {children(openAdminPin)}
      <AdminPinModal
        visible={showPin}
        adminPinHash={adminPinHash}
        onClose={() => setShowPin(false)}
        onVerified={handleVerified}
      />
    </>
  );
}
