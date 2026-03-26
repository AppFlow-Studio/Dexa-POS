import { colors } from "@/lib/theme";
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
    <View style={{ gap: 12 }}>
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
          {allItems.length} checks · {passed} passed
        </Text>
        <Text style={{ fontSize: 10, color: colors.label, marginTop: 4 }}>
          {failed > 0 ? `${failed} blocker(s)` : "No blockers"} · {pending > 0 ? `${pending} still pending` : "Ready to move forward"}
        </Text>
        <TouchableOpacity
          onPress={() => void onRefresh()}
          style={{
            marginTop: 10,
            borderRadius: 8,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            paddingHorizontal: 10,
            paddingVertical: 8,
          }}
          disabled={isLoading}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.teal} />
            ) : null}
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
              Refresh status
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {blockingItems.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
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
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.success + "50",
            backgroundColor: colors.success + "15",
            padding: 10,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>
            All critical checks are clear.
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 4 }}>
            You can continue to Floor & Orders and confirm details as you complete each step.
          </Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
          Quick actions
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTables}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.label }}>Go to tables</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenOrders}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            <Text style={{ fontSize: 11, color: colors.label }}>Go to orders</Text>
          </TouchableOpacity>
          {hasDrawerBlockers ? (
            <TouchableOpacity
              onPress={onOpenCashDrawer}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 11, color: colors.label }}>Open drawer</Text>
            </TouchableOpacity>
          ) : null}
          {hasTipBlockers ? (
            <TouchableOpacity
              onPress={onOpenTips}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 11, color: colors.label }}>Open tips wizard</Text>
            </TouchableOpacity>
          ) : null}
          {hasShiftBlockers ? (
            <TouchableOpacity
              onPress={onOpenStaff}
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            >
              <Text style={{ fontSize: 11, color: colors.label }}>Review staff</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

