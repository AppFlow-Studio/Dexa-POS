/**
 * Refund Fraud Guard Hook
 *
 * Centralizes the self-refund velocity detection logic so all refund modals
 * share identical guard behavior. Checks whether the active employee is
 * refunding their own order, evaluates the velocity window, and fires
 * notifications/toasts when thresholds are crossed.
 */

import { PaymentType } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useNotificationStore } from "@/stores/useNotificationStore";
import {
  useRefundFraudGuardStore,
  type VelocityResult,
} from "@/stores/useRefundFraudGuardStore";
import { useCallback, useRef } from "react";

export interface FraudGuardCheckResult {
  /** The refunding employee is the same as the order creator. */
  isSelfRefund: boolean;
  /** The refund payment method is Cash. */
  isCashRefund: boolean;
  /** Velocity window result (only meaningful when isSelfRefund && isCashRefund). */
  velocity: VelocityResult;
  /** Convenience: employee profile id (staff_profiles.id) of the active cashier. */
  activeEmployeeProfileId: string | null;
  /** Convenience: display name of the active cashier. */
  activeEmployeeName: string;
}

const EMPTY_VELOCITY: VelocityResult = {
  selfRefundCount: 0,
  shouldAlert: false,
  shouldBlock: false,
};

export function useRefundFraudGuard() {
  // Keep a ref to the last check result so recordAndNotify can access it
  // without the caller needing to pass it back.
  const lastCheckRef = useRef<FraudGuardCheckResult | null>(null);

  const checkRefund = useCallback(
    (params: {
      orderCreatedByStaffProfileId: string | null | undefined;
      paymentMethod: PaymentType;
    }): FraudGuardCheckResult => {
      const empStore = useEmployeeStore.getState();
      const activeEmpId = empStore.activeEmployeeId;
      const activeEmp = activeEmpId
        ? empStore.getEmployeeById(activeEmpId)
        : null;
      const profileId = activeEmp?.profileId ?? null;
      const empName = activeEmp?.fullName || "Cashier";

      // Skip guard if disabled in location config
      if (!useRefundFraudGuardStore.getState().isEnabled()) {
        const result: FraudGuardCheckResult = {
          isSelfRefund: false,
          isCashRefund: params.paymentMethod === "Cash",
          velocity: EMPTY_VELOCITY,
          activeEmployeeProfileId: profileId,
          activeEmployeeName: empName,
        };
        lastCheckRef.current = result;
        return result;
      }

      // Can't determine self-refund if either ID is missing
      if (!profileId || !params.orderCreatedByStaffProfileId) {
        const result: FraudGuardCheckResult = {
          isSelfRefund: false,
          isCashRefund: params.paymentMethod === "Cash",
          velocity: EMPTY_VELOCITY,
          activeEmployeeProfileId: profileId,
          activeEmployeeName: empName,
        };
        lastCheckRef.current = result;
        return result;
      }

      const isSelfRefund =
        profileId === params.orderCreatedByStaffProfileId;
      const isCashRefund = params.paymentMethod === "Cash";

      let velocity: VelocityResult = EMPTY_VELOCITY;
      if (isSelfRefund && isCashRefund) {
        velocity =
          useRefundFraudGuardStore.getState().checkVelocity(profileId);
      }

      const result: FraudGuardCheckResult = {
        isSelfRefund,
        isCashRefund,
        velocity,
        activeEmployeeProfileId: profileId,
        activeEmployeeName: empName,
      };
      lastCheckRef.current = result;
      return result;
    },
    [],
  );

  const recordAndNotify = useCallback(
    (params: {
      orderId: string;
      amount: number;
      approvedByManagerId?: string;
      approvedByManagerName?: string;
    }): VelocityResult | undefined => {
      const check = lastCheckRef.current;
      if (!check?.activeEmployeeProfileId) return undefined;

      const store = useRefundFraudGuardStore.getState();
      store.recordSelfRefund({
        employeeProfileId: check.activeEmployeeProfileId,
        orderId: params.orderId,
        amount: params.amount,
        approvedByManagerId: params.approvedByManagerId,
        approvedByManagerName: params.approvedByManagerName,
      });

      // Re-check velocity after recording to get updated count
      const updatedVelocity = store.checkVelocity(
        check.activeEmployeeProfileId,
      );

      // Alert at threshold: notification (toast is handled by caller to avoid being overwritten by success toast)
      if (updatedVelocity.shouldAlert) {
        // Notification for manager review (persists in notification panel)
        useNotificationStore.getState().addNotification({
          type: "refund_fraud_alert",
          message: `${check.activeEmployeeName} has processed ${updatedVelocity.selfRefundCount} same-cashier cash refund(s) in the past hour. Order: ${params.orderId}`,
          employeeId: check.activeEmployeeProfileId,
          payload: {
            orderId: params.orderId,
            refundAmount: params.amount,
            velocityCount: updatedVelocity.selfRefundCount,
            employeeName: check.activeEmployeeName,
          },
        });
      }

      return updatedVelocity;
    },
    [],
  );

  return { checkRefund, recordAndNotify };
}
