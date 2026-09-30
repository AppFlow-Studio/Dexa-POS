/**
 * Schedules tab: a read-only overview of when each menu or category is open.
 * Schedules are authored in Dexa Admin (see category-scheduling.md); tapping a
 * row opens that menu or category in its own tab.
 */
import { FlashList } from "@shopify/flash-list";
import React, { useCallback, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import {
  useCategoryOpenNow,
  useManagedMenus,
  useSortedCategories,
} from "@/hooks/menu/useMenuManagementData";
import { CalendarClock, ChevronRight, Info } from "@/lib/icons";
import { formatScheduleSummary } from "@/lib/menu/menuSchedule";
import { colors } from "@/lib/theme";
import type { Schedule } from "@/lib/types";
import { useMenuManagementUiStore } from "@/stores/useMenuManagementUiStore";

import { EmptyState, FilterChips, Notice, Pill, Surface, useS } from "./ui";

interface ScheduleRowData {
  id: string;
  name: string;
  isActive: boolean;
  openNow: boolean;
  schedules: Schedule[];
}

const ScheduleRow = React.memo(function ScheduleRow({
  row,
  onPress,
}: {
  row: ScheduleRowData;
  onPress: (id: string) => void;
}) {
  const s = useS();
  const rules = row.schedules.filter((r) => r.isActive && r.days?.length);
  return (
    <TouchableOpacity
      onPress={() => onPress(row.id)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Open ${row.name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(16),
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      }}
    >
      <View style={{ flex: 1, gap: s(6) }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}>
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1, fontSize: s(14), fontWeight: "600", color: colors.heading }}
          >
            {row.name}
          </Text>
          {!row.isActive ? (
            <Pill size="sm" tone="danger" label="Inactive" />
          ) : (
            <Pill
              size="sm"
              tone={row.openNow ? "success" : "danger"}
              label={row.openNow ? "Open now" : "Closed now"}
            />
          )}
        </View>
        {rules.length === 0 ? (
          <Text style={{ fontSize: s(13), color: colors.muted }}>
            Always available (no schedule)
          </Text>
        ) : (
          rules.map((rule) => (
            <View key={rule.id} style={{ flexDirection: "row", gap: s(8) }}>
              <CalendarClock size={s(15)} color={colors.label} style={{ marginTop: s(1) }} />
              <Text style={{ flex: 1, fontSize: s(13), color: colors.heading }}>
                {rule.name ? (
                  <Text style={{ fontWeight: "600" }}>{`${rule.name}  `}</Text>
                ) : null}
                <Text style={{ color: colors.label }}>{formatScheduleSummary([rule])}</Text>
              </Text>
            </View>
          ))
        )}
      </View>
      <ChevronRight size={s(16)} color={colors.muted} />
    </TouchableOpacity>
  );
});

function SchedulesPanel() {
  const s = useS();
  const menus = useManagedMenus();
  const categories = useSortedCategories();
  const openNowById = useCategoryOpenNow();
  const view = useMenuManagementUiStore((st) => st.scheduleView);
  const setView = useMenuManagementUiStore((st) => st.setScheduleView);
  const openMenu = useMenuManagementUiStore((st) => st.openMenu);
  const openCategory = useMenuManagementUiStore((st) => st.openCategory);

  const rows = useMemo<ScheduleRowData[]>(() => {
    if (view === "menus") {
      return menus.map((menu) => ({
        id: menu.id,
        name: menu.name,
        isActive: menu.isActive,
        openNow: menu.isAvailableNow,
        schedules: menu.schedules ?? [],
      }));
    }
    return categories.map((category) => ({
      id: category.id,
      name: category.name,
      isActive: category.isActive,
      openNow: openNowById.get(category.id) ?? true,
      schedules: category.schedules ?? [],
    }));
  }, [view, menus, categories, openNowById]);

  const scheduledCount = rows.filter((r) =>
    r.schedules.some((rule) => rule.isActive && rule.days?.length),
  ).length;

  const onPress = view === "menus" ? openMenu : openCategory;
  const renderRow = useCallback(
    ({ item }: { item: ScheduleRowData }) => <ScheduleRow row={item} onPress={onPress} />,
    [onPress],
  );

  return (
    <View style={{ flex: 1, gap: s(12) }}>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "center",
          gap: s(10),
        }}
      >
        <FilterChips
          options={[
            { value: "menus", label: "Menus", count: menus.length },
            { value: "categories", label: "Categories", count: categories.length },
          ]}
          value={view}
          onChange={setView}
        />
        <Text style={{ flex: 1, fontSize: s(13), color: colors.label }}>
          {`${scheduledCount} of ${rows.length} on a schedule`}
        </Text>
      </View>
      <Notice icon={Info}>
        {"Schedules are created and edited in Dexa Admin. This page shows what is open right now on this device's clock."}
      </Notice>
      <Surface style={{ flex: 1 }}>
        <FlashList
          key={view}
          data={rows}
          keyExtractor={(row) => row.id}
          renderItem={renderRow}
          estimatedItemSize={s(76)}
          ListEmptyComponent={
            <EmptyState
              icon={CalendarClock}
              title={view === "menus" ? "No menus yet" : "No categories yet"}
            />
          }
        />
      </Surface>
    </View>
  );
}

export default React.memo(SchedulesPanel);
