import { ChecklistItem } from "@/stores/useEndOfDayStore";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

interface EodStepOverviewProps {
  allItems: ChecklistItem[];
  blockingItems: ChecklistItem[];
  isLoading: boolean;
  onRefresh: () => Promise<void> | void;
  onOpenTables: () => void;
  onOpenOrders: () => void;
  onOpenCashDrawer: () => void;
  onOpenTips: () => void;
  onOpenStaff: () => void;
}

export default function EodStepOverview({
  allItems,
  blockingItems,
  isLoading,
  onRefresh,
  onOpenTables,
  onOpenOrders,
  onOpenCashDrawer,
  onOpenTips,
  onOpenStaff,
}: EodStepOverviewProps) {
  const passed = allItems.filter((item) => item.status === "passed").length;
  const failed = blockingItems.filter((item) => item.status === "failed").length;
  const pending = blockingItems.filter((item) => item.status === "pending").length;

  const hasTablesBlockers = blockingItems.some(
    (item) => item.id === "tables_clear" || item.id === "orders_closed"
  );
  const hasDrawerBlockers = blockingItems.some(
    (item) => item.id === "cash_drawer_closed"
  );
  const hasTipBlockers = blockingItems.some(
    (item) => item.id === "tips_distributed"
  );
  const hasShiftBlockers = blockingItems.some(
    (item) => item.id === "shifts_reviewed"
  );

  return (
    <View className="gap-4">
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="text-sm font-semibold text-white">
          {allItems.length} checks · {passed} passed
        </Text>
        <Text className="mt-1 text-xs text-zinc-300">
          {failed > 0 ? `${failed} blocker(s)` : "No blockers"} · {pending > 0 ? `${pending} still pending` : "Ready to move forward"}
        </Text>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          className="mt-3 self-start rounded-lg bg-cyan-500/15 px-3 py-2"
          disabled={isLoading}
        >
          <View className="flex-row items-center gap-2">
            {isLoading ? (
              <ActivityIndicator size="small" color="#67e8f9" />
            ) : null}
            <Text className="text-xs font-semibold text-cyan-200">Refresh status</Text>
          </View>
        </TouchableOpacity>
      </View>

      {blockingItems.length > 0 ? (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-zinc-100">
            Blockers to resolve
          </Text>
          {blockingItems.map((item) => (
            <EodChecklistRow
              key={item.id}
              title={item.label}
              description={item.description}
              status={item.status}
              detail={item.detail}
            />
          ))}
        </View>
      ) : (
        <View className="rounded-xl border border-emerald-700 bg-emerald-900/30 p-3">
          <Text className="text-sm font-semibold text-emerald-200">
            All critical checks are clear.
          </Text>
          <Text className="mt-1 text-xs text-zinc-200">
            You can continue to Floor & Orders and confirm details as you complete each step.
          </Text>
        </View>
      )}

      <View className="gap-2">
        <Text className="text-sm font-semibold text-zinc-100">Quick actions</Text>
        <View className="flex-row flex-wrap gap-2">
          <TouchableOpacity
            onPress={onOpenTables}
            className="rounded-lg border border-gray-700 bg-panel px-3 py-2"
          >
            <Text className="text-xs text-zinc-100">Go to tables</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenOrders}
            className="rounded-lg border border-gray-700 bg-panel px-3 py-2"
          >
            <Text className="text-xs text-zinc-100">Go to orders</Text>
          </TouchableOpacity>
          {hasDrawerBlockers ? (
            <TouchableOpacity
              onPress={onOpenCashDrawer}
              className="rounded-lg border border-gray-700 bg-panel px-3 py-2"
            >
              <Text className="text-xs text-zinc-100">Open drawer</Text>
            </TouchableOpacity>
          ) : null}
          {hasTipBlockers ? (
            <TouchableOpacity
              onPress={onOpenTips}
              className="rounded-lg border border-gray-700 bg-panel px-3 py-2"
            >
              <Text className="text-xs text-zinc-100">Open tips wizard</Text>
            </TouchableOpacity>
          ) : null}
          {hasShiftBlockers ? (
            <TouchableOpacity
              onPress={onOpenStaff}
              className="rounded-lg border border-gray-700 bg-panel px-3 py-2"
            >
              <Text className="text-xs text-zinc-100">Review staff</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

