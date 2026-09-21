import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useVerifyStaffPin, type VerifiedStaff } from "@/hooks/useVerifyStaffPin";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useCallback } from "react";
import type { PinVerdict } from "../lib/managerPin";
import { PinScreen } from "./PinScreen";

/**
 * The register's OrderPinGate on the handheld: with "Require PIN per order"
 * on, whoever is about to start an order enters their PIN and is credited as
 * its creator. Any staff PIN counts (not a manager rule). Attribution-only —
 * `useVerifyStaffPin` never signs anyone in or clocks them; online it asks
 * `verify_staff_pin`, offline it matches the cached PIN like offline login.
 */
export function StaffPinScreen({
  action,
  onVerified,
  onCancel,
}: {
  /** "Seat table 12" / "Start takeout order" — the `.bar` subtitle. */
  action: string;
  onVerified: (staff: VerifiedStaff) => void;
  onCancel: () => void;
}) {
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id ?? null);
  const { isOnline } = useNetworkStatus();
  const { verifyPin } = useVerifyStaffPin();

  const verify = useCallback(
    async (pin: string): Promise<PinVerdict<VerifiedStaff>> => {
      if (!locationId) return { ok: false, message: "No location selected on this device." };
      const staff = await verifyPin({ pin, locationId, isOnline });
      return staff ? { ok: true, value: staff } : { ok: false, message: "Incorrect PIN. Please try again." };
    },
    [locationId, isOnline, verifyPin],
  );

  return (
    <PinScreen
      title="Enter PIN to start"
      subtitle={action}
      prompt="Enter your PIN — you'll be credited for this order"
      verify={verify}
      onVerified={onVerified}
      onCancel={onCancel}
    />
  );
}
