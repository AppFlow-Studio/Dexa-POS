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

  return (
    <View className="gap-4">
      {/* Tip totals (today or multi-day period) */}
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <View className="mb-3 flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold text-white">
              {isMultiDay ? "Tips to distribute" : "Tips collected today"}
            </Text>
            {isMultiDay && (
              <Text className="text-xs text-zinc-400">{periodStart} – today</Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => refetchTipSummary()}
            disabled={summaryFetching}
            className="rounded-md px-2 py-1"
          >
            <Text className="text-xs text-cyan-400">
              {summaryFetching ? "Refreshing…" : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
        {summaryLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <View className="gap-2">
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-zinc-400">Card tips</Text>
              <Text className="text-sm font-semibold text-white">
                {fmt(tipSummary?.cardTips ?? 0)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-zinc-400">Cash tips</Text>
              <Text className="text-sm font-semibold text-white">
                {fmt(tipSummary?.cashTips ?? 0)}
              </Text>
            </View>
            <View
              className="mt-1 flex-row items-center justify-between border-t border-gray-700 pt-2"
            >
              <Text className="text-sm font-semibold text-zinc-200">Total to distribute</Text>
              <Text className="text-base font-bold" style={{ color: colors.teal }}>
                {fmt(tipSummary?.totalTips ?? 0)}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Prior-day unresolved sessions warning */}
      {(tipSummary?.pendingPriorDaySessions?.length ?? 0) > 0 && (
        <View className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-4">
          <Text className="text-sm font-semibold text-amber-300">
            Unresolved prior-day sessions
          </Text>
          <Text className="mt-1 text-xs text-amber-200/80">
            The following recent sessions were never approved or exported. These days are included in the totals above.
          </Text>
          <View className="mt-2 gap-1">
            {tipSummary!.pendingPriorDaySessions.map((s) => (
              <Text key={s.date} className="text-xs text-amber-100">
                {s.date} — {s.status}
              </Text>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View className="rounded-xl border border-gray-700 bg-panel p-4">
        <Text className="mb-3 text-sm text-zinc-200">
          Review how tips are configured for this location before closing, then launch
          the distribution workflow.
        </Text>
        <View className="gap-2">
          <TouchableOpacity
            onPress={onOpenTipWizard}
            className="rounded-lg bg-cyan-500/20 px-3 py-3"
          >
            <Text className="text-sm font-semibold text-cyan-100">
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
            className="rounded-lg border border-gray-700 bg-panel px-3 py-3"
          >
            <Text className="text-sm text-zinc-100">Refresh status + rules</Text>
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
      <View className="rounded-xl border border-gray-700 bg-panel p-3">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm font-semibold text-white">
            Tip distribution rules
          </Text>
          {(rulesLoading || rulesFetching) ? (
            <Text className="text-[11px] text-zinc-300">Refreshing…</Text>
          ) : null}
        </View>
        {rulesError ? (
          <Text className="mt-2 text-sm text-rose-300">
            Unable to load rules. You can still proceed with tip actions.
          </Text>
        ) : null}
        {!rulesData && !rulesLoading ? (
          <Text className="mt-2 text-sm text-zinc-300">No data available.</Text>
        ) : null}
        {!!rulesData ? (
          <View className="mt-2 gap-3">
            {rulesData.configs.length === 0 && rulesData.rules.length === 0 ? (
              <Text className="text-sm text-zinc-300">
                No active pools or rules found for this location.
              </Text>
            ) : null}
            {rulesData.configs.length > 0 ? (
              <View>
                <Text className="text-xs font-semibold text-zinc-200">
                  Tip pool configs
                </Text>
                {rulesData.configs.map((config) => (
                  <View key={config.id} className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/40 p-3">
                    <View className="flex-row items-center justify-between">
                      <Text className="font-semibold text-white">{config.name}</Text>
                      <View className="rounded-full px-2 py-1" style={{ backgroundColor: `${colors.teal}26` }}>
                        <Text className="text-xs" style={{ color: colors.teal }}>
                          {config.distributionMethod}
                        </Text>
                      </View>
                    </View>
                    {!!config.description ? (
                      <Text className="mt-1 text-xs text-zinc-300">
                        {config.description}
                      </Text>
                    ) : null}
                    {!!config.shares.length ? (
                      <View className="mt-2 gap-1">
                        {config.shares.map((share) => (
                          <Text key={share.id} className="text-xs text-zinc-200">
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
                <Text className="mt-1 text-xs font-semibold text-zinc-200">
                  Tip-out rules
                </Text>
                {rulesData.rules.map((rule) => (
                  <View
                    key={rule.id}
                    className="mt-2 rounded-lg border border-zinc-700 bg-zinc-900/40 p-3"
                  >
                    <Text className="text-sm text-white">
                      {rule.fromRoleName || rule.fromRoleCode} → {rule.toRoleName || rule.toRoleCode}
                    </Text>
                    <Text className="text-xs text-zinc-300">
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
