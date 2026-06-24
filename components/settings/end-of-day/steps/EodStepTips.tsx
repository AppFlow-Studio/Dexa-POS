import { useTipDistributionStore } from "@/stores/useTipDistributionStore";
import { ChecklistItem, ChecklistItemId } from "@/stores/useEndOfDayStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  TipDistributionRulesOverview,
  TodaySessionRow,
  fetchTipDistributionRulesOverview,
  fetchTodaySessions,
  fetchUnsettledTipSummary,
} from "@/services/endOfDayService";
import { getCurrentBusinessDay } from "@/lib/businessDay";
import { formatCurrency } from "@/utils/currency";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import EodChecklistRow from "../EodChecklistRow";
import EodShiftTipReview from "../EodShiftTipReview";

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find((i) => i.id === id);

function fmt(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatTipSource(raw: string) {
  switch (raw) {
    case "charged_tips": return "Charged Tips";
    case "all_tips": return "All Tips";
    case "cash_only": return "Cash Only";
    default: return raw.replace(/_/g, " ");
  }
}

function formatRuleValue(rule: TipDistributionRulesOverview["rules"][number]) {
  if (rule.tipOutType === "flat_amount") {
    return `$${rule.tipOutValue.toFixed(2)} flat`;
  }
  if (rule.tipOutType === "percentage_of_tips") {
    return `${rule.tipOutValue.toFixed(1)}% of tips`;
  }
  if (rule.tipOutType === "percentage_of_sales") {
    return `${rule.tipOutValue.toFixed(1)}% of sales`;
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
  const scale = useUiScale();
  const s = (value: number) => Math.round(value * scale);
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const fetchTipConfig = useTipDistributionStore((state) => state.fetchTipConfig);
  const supabase = useSupabaseClient();

  const locationId = selectedStore?.id || "";

  const { data: tipSummary, isLoading: summaryLoading, isFetching: summaryFetching, refetch: refetchTipSummary } = useQuery({
    queryKey: ["eod-tip-summary", locationId],
    enabled: Boolean(locationId),
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchUnsettledTipSummary(supabase, locationId),
  });

  const { data: rulesData, isLoading: rulesLoading, error: rulesError, isFetching: rulesFetching } = useQuery({
    queryKey: ["eod-tip-rules-overview", locationId],
    enabled: Boolean(locationId),
    staleTime: 60_000,
    queryFn: () => fetchTipDistributionRulesOverview(supabase, locationId),
  });

  const todayStr = getCurrentBusinessDay({
    timezone: selectedStore?.timezone || "UTC",
    rolloverHour: selectedStore?.business_day_start_hour ?? 0,
  });

  const { data: todaySessions, refetch: refetchSessions } = useQuery({
    queryKey: ["eod-today-sessions", locationId, todayStr],
    enabled: Boolean(locationId),
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchTodaySessions(supabase, locationId, todayStr),
  });

  const tipItem = resolveItem(checklist, "tips_distributed");

  const periodStart = tipSummary?.periodStart ?? null;
  const isMultiDay = periodStart !== null && periodStart < todayStr;
  const pendingSessions = tipSummary?.pendingPriorDaySessions ?? [];
  const hasPendingPrior = pendingSessions.length > 0;

  // Multi-session: find the last approved session's cutoff for scoping
  const approvedToday = (todaySessions || []).filter(s => s.status === "approved");
  const lastApprovedCutoff = approvedToday.length > 0
    ? approvedToday[approvedToday.length - 1].dataCutoffAt
    : null;

  return (
    <View style={{ gap: s(10) }}>
      {/* Shift Declaration Review — manager can declare for undeclared staff */}
      <EodShiftTipReview
        supabase={supabase}
        locationId={locationId}
        date={todayStr}
        afterCutoff={lastApprovedCutoff}
      />

      {/* Today's Sessions — multi-session history */}
      {(todaySessions?.length ?? 0) > 0 && (
        <View
          style={{
            borderRadius: s(16),
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            padding: s(12),
            gap: s(8),
          }}
        >
          <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}>
            Today's Close-Out Sessions
          </Text>
          <View style={{ gap: s(4) }}>
            {(todaySessions || []).map((session) => {
              const startTime = session.dataStartAfter
                ? new Date(session.dataStartAfter).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "Start of day";
              const endTime = session.dataCutoffAt
                ? new Date(session.dataCutoffAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "now";
              const statusColor =
                session.status === "approved" ? colors.success
                : session.status === "calculated" ? colors.warning
                : colors.label;
              const statusLabel =
                session.status === "approved" ? "Approved"
                : session.status === "calculated" ? "Awaiting Approval"
                : session.status === "draft" ? "In Progress"
                : session.status;

              return (
                <View
                  key={session.id}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: s(8),
                    paddingHorizontal: s(10),
                    borderRadius: s(10),
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: s(12), fontWeight: "600", color: colors.heading }}>
                      Session #{session.sequenceNumber}
                    </Text>
                    <Text style={{ fontSize: s(10), color: colors.muted, marginTop: s(1) }}>
                      {startTime} — {endTime}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: s(10), fontWeight: "600", color: statusColor }}>
                      {statusLabel}
                    </Text>
                    {session.totalDistributed > 0 && (
                      <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.heading, marginTop: s(1) }}>
                        {formatCurrency(session.totalDistributed)}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View
        style={{
          borderRadius: s(16),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(12),
          gap: s(10),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}>
            Tip Distribution Snapshot
          </Text>
          <View
            style={{
              borderRadius: 999,
              paddingHorizontal: s(8),
              paddingVertical: s(3),
              backgroundColor: colors.teal + "18",
              borderWidth: 1,
              borderColor: colors.teal + "45",
            }}
          >
            <Text style={{ fontSize: s(10), fontWeight: "700", color: colors.teal }}>
              {isMultiDay ? "Multi-day window" : "Today"}
            </Text>
          </View>
        </View>

        {summaryLoading ? (
          <ActivityIndicator size="small" color={colors.teal} />
        ) : (
          <>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
              <View
                style={{
                  flexGrow: 1,
                  flexBasis: s(140),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: s(10),
                }}
              >
                <Text style={{ fontSize: s(10), color: colors.muted, fontWeight: "700" }}>Card Tips (net)</Text>
                <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.heading, marginTop: s(3) }}>
                  {fmt(tipSummary?.cardTipsNet ?? 0)}
                </Text>
                {(tipSummary?.cardTipsProcessorFee ?? 0) > 0 && (
                  <Text style={{ fontSize: s(9), color: colors.muted, marginTop: s(2) }}>
                    gross {fmt(tipSummary?.cardTips ?? 0)} − bank fee {fmt(tipSummary?.cardTipsProcessorFee ?? 0)}
                  </Text>
                )}
              </View>
              <View
                style={{
                  flexGrow: 1,
                  flexBasis: s(120),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: s(10),
                }}
              >
                <Text style={{ fontSize: s(10), color: colors.muted, fontWeight: "700" }}>Cash Tips</Text>
                <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.heading, marginTop: s(3) }}>
                  {fmt(tipSummary?.cashTips ?? 0)}
                </Text>
              </View>
              <View
                style={{
                  flexGrow: 1,
                  flexBasis: s(160),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.teal + "45",
                  backgroundColor: colors.teal + "12",
                  padding: s(10),
                }}
              >
                <Text style={{ fontSize: s(10), color: colors.muted, fontWeight: "700" }}>
                  Total to Distribute
                </Text>
                <Text style={{ fontSize: s(15), fontWeight: "800", color: colors.teal, marginTop: s(3) }}>
                  {fmt(tipSummary?.totalTips ?? 0)}
                </Text>
              </View>
            </View>

            {(tipSummary?.cardTipsProcessorFee ?? 0) > 0 && (
              <View
                style={{
                  marginTop: s(8),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                  borderRadius: s(8),
                  borderWidth: 1,
                  borderColor: colors.warning + "30",
                  backgroundColor: colors.warning + "10",
                  paddingHorizontal: s(10),
                  paddingVertical: s(8),
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.warning }}>
                    Bank fee on card tips: {fmt(tipSummary?.cardTipsProcessorFee ?? 0)}
                  </Text>
                  <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>
                    The bank takes a cut of every card capture before paying the merchant. The "Total to Distribute" already nets this out.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </View>

      {hasPendingPrior && (
        <View
          style={{
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.warning + "55",
            backgroundColor: colors.warning + "12",
            padding: s(10),
          }}
        >
          <Text style={{ fontSize: s(12), fontWeight: "700", color: colors.warning }}>
            Unresolved prior-day sessions ({pendingSessions.length})
          </Text>
          <View style={{ marginTop: s(6), gap: s(4) }}>
            {pendingSessions.map((ps) => (
              <Text key={ps.date} style={{ fontSize: s(10), color: colors.warning }}>
                {ps.date} - {ps.status}
              </Text>
            ))}
          </View>
        </View>
      )}

      <View
        style={{
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(10),
          gap: s(8),
        }}
      >
        <Text style={{ fontSize: s(12), color: colors.label }}>
          Review rules, then run the tip distribution workflow.
        </Text>
        <View style={{ flexDirection: "row", gap: s(8) }}>
          <TouchableOpacity
            onPress={() => {
              onOpenTipWizard();
              // Refresh sessions after wizard closes (handled by onRefresh in parent)
            }}
            style={{
              flex: 1,
              borderRadius: s(9),
              backgroundColor: colors.teal + "22",
              borderWidth: 1,
              borderColor: colors.teal + "55",
              paddingHorizontal: s(10),
              paddingVertical: s(10),
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: s(12), fontWeight: "700", color: colors.teal }}>
              {(() => {
                const sessions = todaySessions || [];
                const hasUnapproved = sessions.some(s => s.status === "calculated");
                const allApproved = sessions.length > 0 && sessions.every(s => s.status === "approved");
                if (hasUnapproved) {
                  const unapproved = sessions.find(s => s.status === "calculated");
                  return `Review Session #${unapproved?.sequenceNumber ?? ""}`;
                }
                if (allApproved) return "Start Another Close-Out";
                return "Start Tip Close-Out";
              })()}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              await Promise.all([
                onRefresh(),
                fetchTipConfig(supabase, locationId),
                refetchTipSummary(),
                refetchSessions(),
              ]);
            }}
            style={{
              flex: 1,
              borderRadius: s(9),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: s(10),
              paddingVertical: s(10),
              alignItems: "center",
            }}
          >
            <Text style={{ fontSize: s(12), color: colors.label }}>
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
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(10),
          gap: s(8),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}>
            Tip Rules
          </Text>
          {(rulesLoading || rulesFetching) ? (
            <Text style={{ fontSize: s(10), color: colors.label }}>Refreshing...</Text>
          ) : null}
        </View>

        {rulesError ? (
          <Text style={{ fontSize: s(12), color: colors.danger }}>
            Unable to load rules. You can still proceed with tip actions.
          </Text>
        ) : null}

        {!rulesData && !rulesLoading ? (
          <Text style={{ fontSize: s(12), color: colors.label }}>No data available.</Text>
        ) : null}

        {!!rulesData ? (
          <View style={{ gap: s(10) }}>
            {rulesData.configs.length === 0 && rulesData.rules.length === 0 ? (
              <Text style={{ fontSize: s(12), color: colors.label }}>
                No active pools or rules found for this location.
              </Text>
            ) : null}

            {rulesData.configs.length > 0 ? (
              <View style={{ gap: s(8) }}>
                <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.label }}>
                  Tip Pool Configs
                </Text>
                {rulesData.configs.map((config) => (
                  <View
                    key={config.id}
                    style={{
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: s(9),
                      gap: s(5),
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ fontWeight: "700", color: colors.heading, fontSize: s(12) }}>
                        {config.name}
                      </Text>
                      <View
                        style={{
                          borderRadius: 20,
                          paddingHorizontal: s(8),
                          paddingVertical: s(3),
                          backgroundColor: colors.teal + "20",
                        }}
                      >
                        <Text style={{ fontSize: s(10), fontWeight: "700", color: colors.teal }}>
                          {config.distributionMethod}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: s(10), color: colors.label }}>
                      Source: {formatTipSource(config.tipSource)} · {config.sourcePercentage}%
                    </Text>
                    {config.contributingRoleCodes?.length > 0 && (
                      <Text style={{ fontSize: s(10), color: colors.label }}>
                        Contributing: {config.contributingRoleCodes.join(", ")}
                      </Text>
                    )}
                    {!!config.description ? (
                      <Text style={{ fontSize: s(11), color: colors.label }}>
                        {config.description}
                      </Text>
                    ) : null}
                    {!!config.shares.length ? (
                      <View style={{ gap: s(3) }}>
                        {config.shares.map((share) => (
                          <Text key={share.id} style={{ fontSize: s(10), color: colors.label }}>
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
              <View style={{ gap: s(8) }}>
                <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.label }}>
                  Tip-out Rules
                </Text>
                {rulesData.rules.map((rule) => (
                  <View
                    key={rule.id}
                    style={{
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      padding: s(9),
                    }}
                  >
                    <Text style={{ fontSize: s(12), color: colors.heading }}>
                      {rule.fromRoleName || rule.fromRoleCode} -{">"} {rule.toRoleName || rule.toRoleCode}
                    </Text>
                    <Text style={{ fontSize: s(10), color: colors.label, marginTop: s(2) }}>
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
