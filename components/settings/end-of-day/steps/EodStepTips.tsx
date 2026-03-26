import { useTipDistributionStore } from "@/stores/useTipDistributionStore";
import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  TipDistributionRulesOverview,
  fetchTipDistributionRulesOverview,
  fetchTodayTipSummary,
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

  const { data: tipSummary, isLoading: summaryLoading } = useQuery({
    queryKey: ["eod-tip-summary", locationId],
    enabled: Boolean(locationId),
    staleTime: 30_000,
    queryFn: () => fetchTodayTipSummary(supabase, locationId),
  });

  const { data: rulesData, isLoading: rulesLoading, error: rulesError, isFetching: rulesFetching } = useQuery({
    queryKey: ["eod-tip-rules-overview", locationId],
    enabled: Boolean(locationId),
    staleTime: 60_000,
    queryFn: () => fetchTipDistributionRulesOverview(supabase, locationId),
  });

  const tipItem = resolveItem(checklist, "tips_distributed");

  return (
    <View style={{ gap: 12 }}>
      {/* Today's tip totals */}
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, marginBottom: 10 }}>
          Tips collected today
        </Text>
        {summaryLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Card tips</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
                {fmt(tipSummary?.cardTips ?? 0)}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ fontSize: 12, color: colors.label }}>Cash tips</Text>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
                {fmt(tipSummary?.cashTips ?? 0)}
              </Text>
            </View>
            <View
              style={{
                marginTop: 6,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 8,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>
                Total to distribute
              </Text>
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.teal }}>
                {fmt(tipSummary?.totalTips ?? 0)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Prior-day unresolved sessions warning */}
      {(tipSummary?.pendingPriorDaySessions?.length ?? 0) > 0 && (
        <View
          style={{
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.warning + "50",
            backgroundColor: colors.warning + "15",
            padding: 12,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.warning }}>
            Unresolved prior-day sessions
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, marginTop: 6 }}>
            The following recent sessions were never approved or exported. Tips from those days may not have been distributed.
          </Text>
          <View style={{ marginTop: 8, gap: 4 }}>
            {tipSummary!.pendingPriorDaySessions.map((s) => (
              <Text key={s.date} style={{ fontSize: 10, color: colors.warning }}>
                {s.date} — {s.status}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
        }}
      >
        <Text style={{ fontSize: 12, color: colors.label, marginBottom: 10 }}>
          Review how tips are configured for this location before closing, then launch
          the distribution workflow.
        </Text>
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTipWizard}
            style={{
              borderRadius: 8,
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.teal }}>
              Open Tip Distribution Wizard
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await Promise.all([
                onRefresh(),
                fetchTipConfig(supabase, locationId),
              ]);
            }}
            style={{
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 10,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.label }}>Refresh status + rules</Text>
          </TouchableOpacity>
        </View>
      </View>

      <EodChecklistRow
        title="Tip status"
        description={tipItem?.description}
        status={tipItem?.status || "pending"}
        detail={tipItem?.detail}
      />

      {/* Tip distribution rules */}
      <View
        style={{
          borderRadius: 10,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
            Tip distribution rules
          </Text>
          {(rulesLoading || rulesFetching) ? (
            <Text style={{ fontSize: 10, color: colors.label }}>Refreshing…</Text>
          ) : null}
        </View>
        {rulesError ? (
          <Text style={{ fontSize: 12, color: colors.danger, marginTop: 8 }}>
            Unable to load rules. You can still proceed with tip actions.
          </Text>
        ) : null}
        {!rulesData && !rulesLoading ? (
          <Text style={{ fontSize: 12, color: colors.label, marginTop: 8 }}>
            No data available.
          </Text>
        ) : null}
        {!!rulesData ? (
          <View style={{ marginTop: 10, gap: 12 }}>
            {rulesData.configs.length === 0 && rulesData.rules.length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.label }}>
                No active pools or rules found for this location.
              </Text>
            ) : null}
            {rulesData.configs.length > 0 ? (
              <View>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label, marginBottom: 8 }}>
                  Tip pool configs
                </Text>
                {rulesData.configs.map((config) => (
                  <View
                    key={config.id}
                    style={{
                      marginTop: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontWeight: "600", color: colors.heading, fontSize: 13 }}>
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
                        <Text style={{ fontSize: 10, fontWeight: "600", color: colors.teal }}>
                          {config.distributionMethod}
                        </Text>
                      </View>
                    </View>
                    {!!config.description ? (
                      <Text style={{ fontSize: 11, color: colors.label, marginTop: 6 }}>
                        {config.description}
                      </Text>
                    ) : null}
                    {!!config.shares.length ? (
                      <View style={{ marginTop: 8, gap: 4 }}>
                        {config.shares.map((share) => (
                          <Text key={share.id} style={{ fontSize: 11, color: colors.label }}>
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
              <View>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.label, marginBottom: 8 }}>
                  Tip-out rules
                </Text>
                {rulesData.rules.map((rule) => (
                  <View
                    key={rule.id}
                    style={{
                      marginTop: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: 10,
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>
                      {rule.fromRoleName || rule.fromRoleCode} → {rule.toRoleName || rule.toRoleCode}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
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
