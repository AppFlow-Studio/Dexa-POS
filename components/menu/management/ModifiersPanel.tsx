/**
 * Modifiers tab: modifier groups on the left, the selected group's options (with
 * per-option 86), group-level 86, and the items that use it on the right.
 */
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import MenuManagementImage from "@/components/menu/MenuManagementImage";
import {
  useManagedModifierGroups,
  type ManagedModifierGroup,
} from "@/hooks/menu/useMenuManagementData";
import {
  ArrowUpDown,
  Ban,
  Globe,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  SearchX,
  Sliders,
} from "@/lib/icons";
import { getItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import {
  SNOOZE_INFINITY,
  formatSnoozeCountdown,
  isActivelySnoozed,
} from "@/lib/snoozeDurations";
import { colors } from "@/lib/theme";
import type { MenuItemType } from "@/lib/types";
import { useMenuManagementUiStore } from "@/stores/useMenuManagementUiStore";
import { formatCurrency } from "@/utils/currency";

import { useMenuManagement } from "./context";
import { DetailHeader, EntityRow, SplitView, useSplitLayout } from "./layout";
import { ReorderList } from "./ReorderList";
import {
  Button,
  EmptyState,
  Notice,
  Pill,
  SearchField,
  SectionLabel,
  Surface,
  useS,
} from "./ui";

/** Items shown under "Used by" before the "Show all" button. */
const USED_BY_PREVIEW = 24;

const selectionSummary = (group: ManagedModifierGroup) => {
  const pick =
    group.selectionType === "single"
      ? "Pick 1"
      : group.maxSelections
        ? `Pick up to ${group.maxSelections}`
        : "Pick any";
  return `${group.type === "required" ? "Required" : "Optional"} · ${pick}`;
};

const snoozeState = (group: ManagedModifierGroup) => {
  const snoozed = group.options.filter((o) => isActivelySnoozed(o.snoozedUntil)).length;
  return {
    snoozed,
    allOut: group.options.length > 0 && snoozed === group.options.length,
  };
};

function ScopePill({
  group,
  showGlobal,
}: {
  group: ManagedModifierGroup;
  showGlobal: boolean;
}) {
  if (group.location_id) {
    return (
      <Pill size="sm" tone="accent" icon={MapPin} label={group.location_name || "Local"} />
    );
  }
  return showGlobal ? <Pill size="sm" tone="neutral" icon={Globe} label="Global" /> : null;
}

const ModifierListRow = React.memo(function ModifierListRow({
  group,
  selected,
  showGlobal,
  onPress,
}: {
  group: ManagedModifierGroup;
  selected: boolean;
  showGlobal: boolean;
  onPress: (id: string) => void;
}) {
  const { snoozed, allOut } = snoozeState(group);
  const optionCount = group.options.length;
  return (
    <EntityRow
      id={group.id}
      title={group.name}
      subtitle={`${selectionSummary(group)} · ${optionCount} ${optionCount === 1 ? "option" : "options"}`}
      selected={selected}
      onPress={onPress}
      pills={
        <>
          {allOut ? (
            <Pill size="sm" tone="danger" icon={Ban} label="Out of stock" />
          ) : snoozed > 0 ? (
            <Pill size="sm" tone="warning" icon={Ban} label={`${snoozed} 86'd`} />
          ) : null}
          <ScopePill group={group} showGlobal={showGlobal} />
        </>
      }
    />
  );
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function UsedByRow({
  item,
  onPress,
}: {
  item: MenuItemType;
  onPress: (item: MenuItemType) => void;
}) {
  const s = useS();
  const Placeholder = getItemPlaceholderIcon(item);
  return (
    <TouchableOpacity
      onPress={() => onPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.name}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(8),
        height: s(44),
        paddingLeft: s(4),
        paddingRight: s(12),
        borderRadius: s(10),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
      }}
    >
      <View
        style={{
          width: s(34),
          height: s(34),
          borderRadius: s(8),
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: colors.panel,
        }}
      >
        {item.image ? (
          <MenuManagementImage
            image={item.image}
            recyclingKey={item.id}
            decodeSize={68}
            style={{ width: "100%", height: "100%" }}
          />
        ) : (
          <Placeholder size={s(16)} color={colors.muted} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={{ maxWidth: s(180), fontSize: s(13), fontWeight: "500", color: colors.heading }}
      >
        {item.name}
      </Text>
      <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.teal }}>
        {formatCurrency(item.price)}
      </Text>
    </TouchableOpacity>
  );
}

const ModifierDetail = React.memo(function ModifierDetail({
  group,
  showGlobal,
}: {
  group: ManagedModifierGroup;
  showGlobal: boolean;
}) {
  const s = useS();
  const { actions, canWrite, openSnooze, openItem } = useMenuManagement();
  const editable = actions.isEntityEditable(group.location_id);
  const [showAllItems, setShowAllItems] = useState(false);
  const { allOut } = snoozeState(group);
  const optionIds = useMemo(() => group.options.map((o) => o.id), [group.options]);

  useEffect(() => {
    setShowAllItems(false);
  }, [group.id]);

  const snoozeGroup = () =>
    openSnooze({
      kind: "modifier-group",
      id: group.id,
      name: group.name,
      optionIds,
      snoozedUntil: allOut ? SNOOZE_INFINITY : null,
    });

  const usedBy = showAllItems ? group.items : group.items.slice(0, USED_BY_PREVIEW);

  return (
    <Surface style={{ flex: 1 }}>
      <DetailHeader
        title={group.name}
        subtitle={group.description || undefined}
        pills={
          <>
            <Pill
              size="sm"
              tone={group.type === "required" ? "warning" : "neutral"}
              label={group.type === "required" ? "Required" : "Optional"}
            />
            <Pill size="sm" tone="neutral" label={selectionSummary(group).split(" · ")[1]} />
            <ScopePill group={group} showGlobal={showGlobal} />
          </>
        }
        actions={
          <>
            {group.options.length > 0 && (
              <Button
                label={allOut ? "Restock all" : "86 all"}
                icon={allOut ? RotateCcw : Ban}
                variant={allOut ? "secondary" : "danger"}
                onPress={snoozeGroup}
                disabled={!canWrite}
              />
            )}
            {editable && (
              <Button
                label="Edit"
                icon={Pencil}
                onPress={() => router.push(`/menu/edit-modifier?id=${group.id}`)}
                disabled={!canWrite}
              />
            )}
          </>
        }
      />
      <ScrollView contentContainerStyle={{ padding: s(16), gap: s(18) }}>
        {!editable && (
          <Notice icon={Globe}>
            {"This modifier is shared across your locations, so it is edited in Dexa Admin. Options can still be 86'd here."}
          </Notice>
        )}

        <View>
          <SectionLabel>{`Options (${group.options.length})`}</SectionLabel>
          {group.options.length === 0 ? (
            <Surface>
              <EmptyState icon={Sliders} title="No options in this group" />
            </Surface>
          ) : (
            <Surface>
              {group.options.map((option, index) => {
                const countdown = formatSnoozeCountdown(option.snoozedUntil);
                const snoozed = countdown !== null;
                return (
                  <View
                    key={option.id ?? index}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(12),
                      minHeight: s(56),
                      paddingVertical: s(8),
                      paddingHorizontal: s(14),
                      borderBottomWidth: index === group.options.length - 1 ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, gap: s(2), opacity: snoozed ? 0.6 : 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: s(14), fontWeight: "500", color: colors.heading }}
                      >
                        {option.name}
                      </Text>
                      <Text style={{ fontSize: s(12), color: colors.label }}>
                        {option.price > 0 ? `+${formatCurrency(option.price)}` : "No charge"}
                        {option.isDefault ? " · Default" : ""}
                      </Text>
                    </View>
                    {snoozed && (
                      <Pill
                        size="sm"
                        tone="danger"
                        icon={Ban}
                        label={countdown === "86" ? "86'd" : `86'd · ${countdown}`}
                      />
                    )}
                    <Button
                      size="sm"
                      label={snoozed ? "Restock" : "86"}
                      icon={snoozed ? RotateCcw : Ban}
                      variant={snoozed ? "secondary" : "danger"}
                      accessibilityLabel={
                        snoozed ? `Restock ${option.name}` : `Mark ${option.name} out of stock`
                      }
                      onPress={() =>
                        openSnooze({
                          kind: "modifier-option",
                          id: option.id,
                          name: option.name,
                          snoozedUntil: option.snoozedUntil,
                        })
                      }
                      disabled={!canWrite}
                    />
                  </View>
                );
              })}
            </Surface>
          )}
        </View>

        <View>
          <SectionLabel>{`Used by (${group.items.length})`}</SectionLabel>
          {group.items.length === 0 ? (
            <Text style={{ fontSize: s(13), color: colors.muted }}>
              No items use this modifier yet.
            </Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
              {usedBy.map((item) => (
                <UsedByRow key={item.id} item={item} onPress={openItem} />
              ))}
              {!showAllItems && group.items.length > USED_BY_PREVIEW && (
                <Button
                  label={`Show all ${group.items.length}`}
                  onPress={() => setShowAllItems(true)}
                  style={{ height: s(44) }}
                />
              )}
            </View>
          )}
        </View>
      </ScrollView>
    </Surface>
  );
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function ModifiersPanel() {
  const s = useS();
  const { actions, canWrite } = useMenuManagement();
  const groups = useManagedModifierGroups();
  const search = useMenuManagementUiStore((st) => st.modifierSearch);
  const setSearch = useMenuManagementUiStore((st) => st.setModifierSearch);
  const deferredSearch = useDeferredValue(search);
  const selectedId = useMenuManagementUiStore((st) => st.selectedModifierId);
  const selectModifier = useMenuManagementUiStore((st) => st.selectModifier);
  const split = useSplitLayout();
  const [reordering, setReordering] = useState(false);
  // "Global" only means something to a merchant with more than one location.
  const showGlobal = !actions.isSingleLocation && !actions.isSingleLocationLoading;

  const visibleGroups = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(query) ||
        group.options.some((o) => o.name.toLowerCase().includes(query)),
    );
  }, [groups, deferredSearch]);

  const selected = groups.find((g) => g.id === selectedId) ?? null;

  useEffect(() => {
    if (split.isWide && !selected && visibleGroups.length > 0) {
      selectModifier(visibleGroups[0].id);
    }
  }, [split.isWide, selected, visibleGroups, selectModifier]);

  const renderRow = useCallback(
    ({ item: group }: { item: ManagedModifierGroup }) => (
      <ModifierListRow
        group={group}
        selected={group.id === selectedId}
        showGlobal={showGlobal}
        onPress={selectModifier}
      />
    ),
    [selectedId, showGlobal, selectModifier],
  );

  const reorderRows = useMemo(
    () =>
      groups.map((group) => ({
        id: group.id,
        title: group.name,
        subtitle: selectionSummary(group),
      })),
    [groups],
  );

  const addModifier = useCallback(() => router.push("/menu/add-modifier"), []);

  const list = reordering ? (
    <ReorderList
      title="Modifier order"
      rows={reorderRows}
      disabled={!canWrite}
      onDone={() => setReordering(false)}
      onReorder={(ids) => void actions.reorderModifierGroups(ids)}
    />
  ) : (
    <Surface style={{ flex: 1 }}>
      <View
        style={{ padding: s(10), borderBottomWidth: 1, borderBottomColor: colors.border }}
      >
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search modifiers or options"
        />
      </View>
      <FlashList
        data={visibleGroups}
        extraData={renderRow}
        keyExtractor={(group) => group.id}
        renderItem={renderRow}
        estimatedItemSize={s(84)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          search.trim() ? (
            <EmptyState icon={SearchX} title="No modifiers match" />
          ) : (
            <EmptyState
              icon={Sliders}
              title="No modifiers yet"
              description="Modifier groups hold choices like sizes, sides and add-ons."
            />
          )
        }
      />
    </Surface>
  );

  return (
    <View style={{ flex: 1, gap: s(12) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
        <Text style={{ flex: 1, fontSize: s(13), color: colors.label }}>
          {`${groups.length} modifier ${groups.length === 1 ? "group" : "groups"}`}
        </Text>
        {groups.length > 1 && (
          <Button
            label="Reorder"
            icon={ArrowUpDown}
            onPress={() => {
              setReordering(true);
              if (!split.isWide) selectModifier(null);
            }}
            disabled={!canWrite || reordering}
          />
        )}
        <Button
          label="Add modifier"
          icon={Plus}
          variant="primary"
          onPress={addModifier}
          disabled={!canWrite}
        />
      </View>

      <SplitView
        split={split}
        list={list}
        detail={selected ? <ModifierDetail group={selected} showGlobal={showGlobal} /> : null}
        backLabel="All modifiers"
        onBack={() => selectModifier(null)}
        emptyDetail={{
          icon: Sliders,
          title: "Select a modifier group",
          description: "Pick a group to see its options and the items that use it.",
        }}
      />
    </View>
  );
}

export default React.memo(ModifiersPanel);
