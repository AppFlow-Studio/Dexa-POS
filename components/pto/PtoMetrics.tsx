import PTOBalanceCard from "@/components/profile/PTOBalanceCard"; // Import PTOBalanceCard
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePtoStore } from "@/stores/usePtoStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  differenceInHours,
  isFuture,
  isToday,
  parseISO,
  startOfDay,
} from "date-fns";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  TrendingUp,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { View } from "react-native";

interface PtoMetricsProps {
  employeeId: string;
}

const PtoMetrics: React.FC<PtoMetricsProps> = ({ employeeId }) => {
  // Atomic selectors
  const balances = usePtoStore((state) => state.balances);
  const ptoRequests = useScheduleStore((state) => state.ptoRequests);
  const { schedulePeriods, weeklySchedules } = useScheduleStore();
  const { ptoAccrualRate } = useStoreSettingsStore();
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);

  const employeeBalance = balances[employeeId] || {
    totalAccrued: 0,
    usedThisYear: 0,
  };

  const metrics = useMemo(() => {
    const totalAccrued = employeeBalance.totalAccrued;
    const usedThisYear = employeeBalance.usedThisYear;

    const pendingApproval = ptoRequests
      .filter(
        (req) => req.employeeId === employeeId && req.status === "pending"
      )
      .reduce((sum, req) => sum + req.hours, 0);

    const spendableBalance = totalAccrued - usedThisYear - pendingApproval;

    const today = startOfDay(new Date());

    const futureShifts = [...schedulePeriods, ...weeklySchedules]
      .filter((p) => p.status === "active")
      .flatMap((s) => s.shifts)
      .filter((shift) => {
        if (shift.employeeId !== loggedInEmployee?.id) return false;
        // Correctly parse the date string to avoid timezone issues
        const shiftDate = parseISO(shift.date);
        return isToday(shiftDate) || isFuture(shiftDate);
      });

    const futureHours = futureShifts.reduce((total, shift) => {
      const startTime = parseISO(shift.startTime);
      const endTime = parseISO(shift.endTime);
      const duration = differenceInHours(endTime, startTime);
      return total + duration;
    }, 0);

    const ptoFromFutureShifts = futureHours * ptoAccrualRate;
    const currentAccrued = employeeBalance.totalAccrued;

    const projectedPto = ptoFromFutureShifts;

    return {
      spendableBalance,
      projectedPto,
      totalAccrued,
      usedThisYear,
      pendingApproval,
    };
  }, [
    employeeId,
    employeeBalance,
    ptoRequests,
    schedulePeriods,
    weeklySchedules,
    ptoAccrualRate,
    loggedInEmployee?.id,
  ]);

  return (
    <View className="py-4  mb-4">
      <View className="flex-row gap-4 mb-6 flex-wrap">
        <PTOBalanceCard
          label="Spendable Balance"
          value={`${metrics.spendableBalance.toFixed(2)}h`}
          icon={<Clock size={20} color="#22c55e" />}
          variant="success"
        />
        <PTOBalanceCard
          label="Projected PTO"
          value={`${metrics.projectedPto.toFixed(2)}h`}
          icon={<TrendingUp size={20} color="#60A5FA" />}
          variant="primary"
        />
        <PTOBalanceCard
          label="Total Accrued"
          value={`${metrics.totalAccrued.toFixed(2)}h`}
          icon={<TrendingUp size={20} color="#9CA3AF" />}
          variant="default"
        />
        <PTOBalanceCard
          label="Used This Year"
          value={`${metrics.usedThisYear.toFixed(2)}h`}
          icon={<CheckCircle2 size={20} color="#9CA3AF" />}
          variant="secondary"
        />
        <PTOBalanceCard
          label="Pending Approval"
          value={`${metrics.pendingApproval.toFixed(2)}h`}
          icon={<AlertCircle size={20} color="#f59e0b" />}
          variant="warning"
        />
      </View>
    </View>
  );
};

export default PtoMetrics;
