import React from "react";
import { verifyManagerPin } from "../../lib/managerPin";
import { PinScreen } from "../PinScreen";

/**
 * S6: asks a manager for their PIN and reports who approved. Verification
 * is the register's rule in lib/managerPin.ts; a wrong PIN clears and says why.
 */
export function ManagerPinScreen({
  action,
  onApproved,
  onCancel,
}: {
  /** "Void order #1045" — the `.bar` subtitle. */
  action: string;
  onApproved: (managerName: string) => void;
  onCancel: () => void;
}) {
  return (
    <PinScreen
      title="Manager approval"
      subtitle={action}
      prompt="Ask a manager to enter their PIN"
      verify={verifyManagerPin}
      onVerified={onApproved}
      onCancel={onCancel}
    />
  );
}
