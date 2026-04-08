import { useTipDistributionStore } from "@/stores/useTipDistributionStore";
import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  TipDistributionRulesOverview,
  TodayTipSummary,
  fetchTipDistributionRulesOverview,
  fetchUnsettledTipSummary,
  computeLocalUnsettledTips,
} from "@/services/endOfDayService";
import { colors } from "@/lib/theme";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatRuleValue(rule: TipDistributionRulesOverview["rules"][number]) {
  if (rule.tipOutType === "flat") {
    return `${rule.tipOutValue.toFixed(2)} fixed`;
  }
  if (rule.tipOutType === "percent" || rule.tipOutType === "percentage") {
    return `${rule.tipOutValue.toFixed(1)}%`;
  }
  return `${rule.tipOutValue} ${rule.tipOutType}`;
}

interface EodStepTipsProps {
  checklist: ChecklistItem[];
  onOpenTipWizard: () => void;
  onRefresh: () => Promise<void> | void;
}

export default function EodStepTips({
  checklist,
  onOpenTipWizard,
  onRefresh,
}: EodStepTipsProps) {
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const fetchTipConfig = useTipDistributionStore((state) => state.fetchTipConfig);
  const supabase = useSupabaseClient();

  const locationId = selectedStore?.id || "";

  const { data: tipSummary, isLoading: summaryLoading, isFetching: summaryFetching, refetch: refetchTipSummary } = useQuery({
    queryKey: ["eod-tip-summary", locationId],
    enabled: Boolean(locationId),
    staleTime: 30_000,
    placeholderData: (): TodayTipSummary => ({
      ...computeLocalUnsettledTips(),
      periodStart: null,
      pendingPriorDaySessions: [],
    }),
    queryFn: () => fetchUnsettledTipSummary(supabase, locationId),
  });

  const { data: rulesData, isLoading: rulesLoading, error: rulesError, isFetching: rulesFetching } = useQuery({
    queryKey: ["eod-tip-rules-overview", locationId],
    enabled: Boolean(locationId),
    staleTime: 60_000,
    queryFn: () => fetchTipDistributionRulesOverview(supabase, locationId),
  });

  const tipItem = resolveItem(checklist, "tips_distributed");

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const periodStart = tipSummary?.periodStart ?? null;
  const isMultiDay = periodStart !== null && periodStart < todayStr;
  const pendingSessions = tipSummary?.pendingPriorDaySessions ?? [];
  const hasPendingPrior = pendingSessions.length > 0;

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>
            Tip Distribution Snapshot
          </Text>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: 8,
              paddingVertical: 3,
              backgroundColor: colors.teal + "18",
              borderWidth: 1,
              borderColor: colors.teal + "45",
            }}
          >
            <Text style={{ fontSize: 10, fontWeight: "700", color: colors.teal }}>
              {isMultiDay ? "Multi-day window" : "Today"}
            </Text>
          </View>
        </View>

        {summaryLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <View
              style={{
                flexGrow: 1,
                flexBasis: 120,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Card Tips</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading, marginTop: 3 }}>
                {fmt(tipSummary?.cardTips ?? 0)}
              </Text>
            </View>
            <View
              style={{
                flexGrow: 1,
                flexBasis: 120,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>Cash Tips</Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading, marginTop: 3 }}>
                {fmt(tipSummary?.cashTips ?? 0)}
              </Text>
            </View>
            <View
              style={{
                flexGrow: 1,
                flexBasis: 160,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.teal + "45",
                backgroundColor: colors.teal + "12",
                padding: 10,
              }}
            >
              <Text style={{ fontSize: 10, color: colors.muted, fontWeight: "700" }}>
                Total to Distribute
              </Text>
              <Text style={{ fontSize: 15, fontWeight: "800", color: colors.teal, marginTop: 3 }}>
                {fmt(tipSummary?.totalTips ?? 0)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {hasPendingPrior && (
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warning + "55",
            backgroundColor: colors.warning + "12",
            padding: 10,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.warning }}>
            Unresolved prior-day sessions ({pendingSessions.length})
          </Text>
          <View style={{ marginTop: 6, gap: 4 }}>
            {pendingSessions.map((s) => (
              <Text key={s.date} style={{ fontSize: 10, color: colors.warning }}>
                {s.date} - {s.status}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 10,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.label }}>
          Review rules, then run the tip distribution workflow.
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTipWizard}
            style={{
              flex: 1,
              borderRadius: 9,
              backgroundColor: colors.teal + "22",
              borderWidth: 1,
              borderColor: colors.teal + "55",
              paddingHorizontal: 10,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: "700", color: colors.teal }}>
              Open Tip Wizard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await Promise.all([
                onRefresh(),
                fetchTipConfig(supabase, locationId),
                refetchTipSummary(),
              ]);
            }}
            style={{
              flex: 1,
              borderRadius: 9,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 12, color: colors.label }}>
              {summaryFetching || rulesFetching ? "Refreshing..." : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <EodChecklistRow
        title="Tip status"
        description={tipItem?.description}
        status={tipItem?.status || "pending"}
        detail={tipItem?.detail}
      />

      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 10,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}>
            Tip Rules
          </Text>
          {(rulesLoading || rulesFetching) ? (
            <Text style={{ fontSize: 10, color: colors.label }}>Refreshing...</Text>
          ) : null}
        </View>

        {rulesError ? (
          <Text style={{ fontSize: 12, color: colors.danger }}>
            Unable to load rules. You can still proceed with tip actions.
          </Text>
        ) : null}

        {!rulesData && !rulesLoading ? (
          <Text style={{ fontSize: 12, color: colors.label }}>No data available.</Text>
        ) : null}

        {!!rulesData ? (
          <View style={{ gap: 10 }}>
            {rulesData.configs.length === 0 && rulesData.rules.length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.label }}>
                No active pools or rules found for this location.
              </Text>
            ) : null}

            {rulesData.configs.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.label }}>
                  Tip Pool Configs
                </Text>
                {rulesData.configs.map((config) => (
                  <View
                    key={config.id}
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 9,
                      gap: 5,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontWeight: "700", color: colors.heading, fontSize: 12 }}>
                        {config.name}
                      </Text>
                      <View
                        style={{
                          borderRadius: 20,
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          backgroundColor: colors.teal + "20",
                        }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: "700", color: colors.teal }}>
                          {config.distributionMethod}
                        </Text>
                      </View>
                    </View>
                    {!!config.description ? (
                      <Text style={{ fontSize: 11, color: colors.label }}>
                        {config.description}
                      </Text>
                    ) : null}
                    {!!config.shares.length ? (
                      <View style={{ gap: 3 }}>
                        {config.shares.map((share) => (
                          <Text key={share.id} style={{ fontSize: 10, color: colors.label }}>
                            {share.roleName || share.roleCode}: {share.sharePercentage}%
                            {share.pointsPerHour ? ` (${share.pointsPerHour} pp/h)` : ""}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {rulesData.rules.length > 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.label }}>
                  Tip-out Rules
                </Text>
                {rulesData.rules.map((rule) => (
                  <View
                    key={rule.id}
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 9,
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.heading }}>
                      {rule.fromRoleName || rule.fromRoleCode} -{">"} {rule.toRoleName || rule.toRoleCode}
                    </Text>-
                    <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }}>
                      {formatRuleValue(rule)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
