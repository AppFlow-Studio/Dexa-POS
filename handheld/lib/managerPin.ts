import type { MerchantRole } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";

/** The roles ManagerPinModal and MoreOptionsBottomSheet accept. */
const MANAGER_ROLES: readonly MerchantRole[] = ["merchant.manager", "merchant.admin", "merchant.owner"];

export const PIN_LENGTH = 4;

export type PinVerdict = { ok: true; name: string } | { ok: false; message: string };

/** The register's rule, verbatim: the PIN must belong to a manager-role employee. */
export function verifyManagerPin(pin: string): PinVerdict {
  const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
  if (employee && MANAGER_ROLES.includes(employee.role)) {
    return { ok: true, name: employee.displayName || employee.fullName };
  }
  return {
    ok: false,
    message: employee
      ? "This employee does not have manager access."
      : "The PIN you entered does not match any employee.",
  };
}
