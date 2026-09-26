/**
 * Menus tab: menus on the left, the selected menu on the right.
 *
 * The detail answers "why is (or isn't) this menu on the POS right now" in one
 * place: active flag, this device's hide switch, schedule, and channel
 * visibility. The old screen spread that across three unlabeled icon buttons
 * and a chip row. The menu's categories are listed with their own status, and
 * tapping one opens it on the Categories tab.
 */
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Switch } from "@/components/ui/switch";
import { useOnlineMenu } from "@/hooks/pos/useOnlineMenu";
import {
  useCategoryItemIndex,
  useManagedMenus,
  type ManagedMenu,
} from "@/hooks/menu/useMenuManagementData";
import { useScheduleClock } from "@/hooks/useScheduleClock";
import {
  ArrowUpDown,
  CalendarClock,
  ChevronRight,
  Globe,
  Layers,
  Pencil,
  Plus,
} from "@/lib/icons";
import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";
import { formatScheduleSummary } from "@/lib/menu/menuSchedule";
import { getMenuStatusChips } from "@/lib/menu/menuStatusReasons";
import { colors } from "@/lib/theme";
import { useMenuManagementUiStore } from "@/stores/useMenuManagementUiStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMenuVisibilityStore } from "@/stores/useMenuVisibilityStore";

import { useMenuManagement } from "./context";
import { DetailHeader, EntityRow, SplitView, useSplitLayout } from "./layout";
import { ReorderList } from "./ReorderList";
import {
  Button,
  EmptyState,
  Notice,
  Pill,
  SectionLabel,
  SettingRow,
  Surface,
  useS,
} from "./ui";

const EMPTY_IDS: string[] = [];

function MenuStatusPills({
  menu,
  isHidden,
  isOnline,
}: {
  menu: ManagedMenu;
  isHidden: boolean;
  isOnline: boolean;
}) {
  const chips = getMenuStatusChips(menu, {
    isAvailableNow: menu.isAvailableNow,
    isHiddenOnDevice: isHidden,
  });
  return (
    <>
      {chips.length === 0 ? (
        <Pill tone="success" label="Available" size="sm" />
      ) : (
        chips.map((chip) => (
          <Pill
            key={chip.key}
            size="sm"
            // Blocking = it explains a gap in THIS device's POS grid.
            tone={chip.blocking ? "danger" : "warning"}
            label={chip.label}
          />
        ))
      )}
      {isOnline && <Pill tone="info" icon={Globe} label="Online" size="sm" />}
    </>
  );
}

const MenuListRow = React.memo(function MenuListRow({
  menu,
  selected,
  isHidden,
  isOnline,
  itemCount,
  onPress,
}: {
  menu: ManagedMenu;
  selected: boolean;
  isHidden: boolean;
  isOnline: boolean;
  itemCount: number;
  onPress: (id: string) => void;
}) {
  const categoryCount = menu.categories.length;
  return (
    <EntityRow
      id={menu.id}
      title={menu.name}
      subtitle={`${categoryCount} ${categoryCount === 1 ? "category" : "categories"} · ${itemCount} ${itemCount === 1 ? "item" : "items"}`}
      selected={selected}
      dimmed={isHidden || !menu.isActive}
      onPress={onPress}
      pills={<MenuStatusPills menu={menu} isHidden={isHidden} isOnline={isOnline} />}
    />
  );
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

function ChannelRow({ label, on, last }: { label: string; on: boolean; last?: boolean }) {
  const s = useS();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: s(10),
        paddingHorizontal: s(14),
        borderBottomWidth: last ? 0 : 1,
        borderBottomColor: colors.border,
      }}
    >
      <Text style={{ fontSize: s(14), color: colors.heading }}>{label}</Text>
      <Pill tone={on ? "success" : "neutral"} label={on ? "On" : "Off"} size="sm" />
    </View>
  );
}

interface MenuDetailProps {
  menu: ManagedMenu;
  isHidden: boolean;
  isOnline: boolean;
  itemCountByCategoryId: Map<string, number>;
}

const MenuDetail = React.memo(function MenuDetail({
  menu,
  isHidden,
  isOnline,
  itemCountByCategoryId,
}: MenuDetailProps) {
  const s = useS();
  const { actions, canWrite } = useMenuManagement();
  const storeId = actions.storeId;
  const editable = actions.isEntityEditable(menu.location_id);
  const toggleHiddenMenu = useMenuVisibilityStore((st) => st.toggleHiddenMenu);
  const storeCategories = useMenuStore((st) => st.categories);
  const overrides = useMenuStore((st) => st.menuCategoryOverrides[menu.id]);
  const isCategoryAvailableNow = useMenuStore((st) => st.isCategoryAvailableNow);
  const openCategory = useMenuManagementUiStore((st) => st.openCategory);
  const now = useScheduleClock();
  const [reordering, setReordering] = useState(false);

  // Switching to another menu ends reorder mode.
  useEffect(() => {
    setReordering(false);
  }, [menu.id]);

  const categoryActiveById = useMemo(
    () => new Map(storeCategories.map((c) => [c.id, c.isActive])),
    [storeCategories],
  );

  const scheduleSummary = formatScheduleSummary(menu.schedules);

  const reorderRows = useMemo(
    () =>
      menu.categories.map((category) => {
        const count = itemCountByCategoryId.get(category.id) ?? 0;
        return {
          id: category.id,
          title: category.name,
          subtitle: `${count} ${count === 1 ? "item" : "items"}`,
        };
      }),
    [menu.categories, itemCountByCategoryId],
  );

  const header = (
    <DetailHeader
      title={menu.name}
      subtitle={menu.description || undefined}
      pills={<MenuStatusPills menu={menu} isHidden={isHidden} isOnline={isOnline} />}
      actions={
        editable ? (
          <Button
            label="Edit"
            icon={Pencil}
            onPress={() => router.push(`/menu/edit-menu?id=${menu.id}`)}
            disabled={!canWrite}
          />
        ) : null
      }
    />
  );

  if (reordering) {
    return (
      <ReorderList
        title={`Category order in ${menu.name}`}
        rows={reorderRows}
        disabled={!canWrite}
        onDone={() => setReordering(false)}
        onReorder={(_ids, from, to) =>
          void actions.reorderMenuCategories(menu.id, from, to)
        }
      />
    );
  }

  return (
    <Surface style={{ flex: 1 }}>
      {header}
      <ScrollView contentContainerStyle={{ padding: s(16), gap: s(18) }}>
        {!editable && (
          <Notice icon={Globe}>
            This menu is shared across your locations, so it is edited in Dexa
            Admin. You can still hide it on this device.
          </Notice>
        )}

        <View>
          <SectionLabel>Availability</SectionLabel>
          <Surface>
            <SettingRow
              title="Active"
              description="Turns this menu on or off at every station and channel."
              right={
                <Switch
                  checked={menu.isActive}
                  onCheckedChange={() => void actions.toggleMenuActive(menu.id)}
                  disabled={!editable || !canWrite}
                  accessibilityLabel={`${menu.name} active`}
                />
              }
            />
            <SettingRow
              last
              title="Show on this device"
              description="Only affects this tablet. Other stations are unchanged."
              right={
                <Switch
                  checked={!isHidden}
                  onCheckedChange={() => {
                    if (storeId) toggleHiddenMenu(storeId, menu.id);
                  }}
                  disabled={!storeId}
                  accessibilityLabel={`Show ${menu.name} on this device`}
                />
              }
            />
          </Surface>
        </View>

        <View>
          <SectionLabel>Schedule and channels</SectionLabel>
          <Surface>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(10),
                paddingVertical: s(12),
                paddingHorizontal: s(14),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <CalendarClock size={s(18)} color={colors.label} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: s(14), color: colors.heading }}>
                  {scheduleSummary || "Always available"}
                </Text>
                <Text style={{ fontSize: s(12), color: colors.muted }}>
                  {menu.isAvailableNow ? "Open right now" : "Closed right now"}
                </Text>
              </View>
            </View>
            <ChannelRow label="POS" on={isMenuVisibleOnChannel(menu, "pos")} />
            <ChannelRow label="Kiosk" on={isMenuVisibleOnChannel(menu, "kiosk")} />
            <ChannelRow label="Online ordering" on={isOnline} last />
          </Surface>
          <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(6) }}>
            Schedules and channels are managed in Dexa Admin.
          </Text>
        </View>

        <View>
          <SectionLabel
            right={
              menu.categories.length > 1 ? (
                <Button
                  size="sm"
                  label="Reorder"
                  icon={ArrowUpDown}
                  onPress={() => setReordering(true)}
                  disabled={!canWrite}
                />
              ) : null
            }
          >
            {`Categories (${menu.categories.length})`}
          </SectionLabel>
          {menu.categories.length === 0 ? (
            <Surface>
              <EmptyState
                icon={Layers}
                title="No categories in this menu"
                description="Categories are added to menus from Edit menu or Dexa Admin."
              />
            </Surface>
          ) : (
            <Surface>
              {menu.categories.map((category, index) => {
                const count = itemCountByCategoryId.get(category.id) ?? 0;
                const isActive = categoryActiveById.get(category.id) ?? category.isActive;
                const openNow = isCategoryAvailableNow(category.id, menu.id, now);
                const shownHere = overrides?.[category.id] !== false;
                const last = index === menu.categories.length - 1;
                return (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => openCategory(category.id, menu.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${category.name}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(12),
                      minHeight: s(60),
                      paddingVertical: s(10),
                      paddingHorizontal: s(14),
                      borderBottomWidth: last ? 0 : 1,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, gap: s(4) }}>
                      <Text
                        numberOfLines={1}
                        style={{ fontSize: s(14), fontWeight: "600", color: colors.heading }}
                      >
                        {category.name}
                      </Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(4) }}>
                        <Text style={{ fontSize: s(12), color: colors.label, marginRight: s(4) }}>
                          {`${count} ${count === 1 ? "item" : "items"}`}
                        </Text>
                        {!isActive ? (
                          <Pill size="sm" tone="danger" label="Inactive" />
                        ) : !openNow ? (
                          <Pill size="sm" tone="danger" label="Off schedule" />
                        ) : null}
                        {!shownHere && <Pill size="sm" tone="warning" label="Hidden here" />}
                      </View>
                    </View>
                    <Switch
                      checked={shownHere}
                      onCheckedChange={() =>
                        actions.toggleCategoryInMenuOnDevice(menu.id, category.id)
                      }
                      accessibilityLabel={`Show ${category.name} in ${menu.name} on this device`}
                    />
                    <ChevronRight size={s(16)} color={colors.muted} />
                  </TouchableOpacity>
                );
              })}
            </Surface>
          )}
          <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(6) }}>
            The switches hide a category inside this menu on this device only,
            until the app restarts.
          </Text>
        </View>
      </ScrollView>
    </Surface>
  );
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function MenusPanel() {
  const s = useS();
  const { actions, canWrite } = useMenuManagement();
  const menus = useManagedMenus();
  const { itemsByCategoryId } = useCategoryItemIndex();
  const { onlineMenuId } = useOnlineMenu(actions.storeId);
  const hiddenIds = useMenuVisibilityStore((st) =>
    actions.storeId
      ? (st.hiddenMenuIdsByLocation[actions.storeId] ?? EMPTY_IDS)
      : EMPTY_IDS,
  );
  const selectedMenuId = useMenuManagementUiStore((st) => st.selectedMenuId);
  const selectMenu = useMenuManagementUiStore((st) => st.selectMenu);
  const split = useSplitLayout();
  const [reordering, setReordering] = useState(false);

  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);

  const itemCountByCategoryId = useMemo(() => {
    const counts = new Map<string, number>();
    itemsByCategoryId.forEach((items, id) => counts.set(id, items.length));
    return counts;
  }, [itemsByCategoryId]);

  const itemCountByMenuId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const menu of menus) {
      const ids = new Set<string>();
      for (const category of menu.categories) {
        for (const item of itemsByCategoryId.get(category.id) ?? []) ids.add(item.id);
      }
      counts.set(menu.id, ids.size);
    }
    return counts;
  }, [menus, itemsByCategoryId]);

  const selectedMenu = menus.find((m) => m.id === selectedMenuId) ?? null;

  // Wide layout: never show an empty detail pane when there is something to
  // show. Also recovers when the selected menu is deleted elsewhere.
  useEffect(() => {
    if (split.isWide && !selectedMenu && menus.length > 0) {
      selectMenu(menus[0].id);
    }
  }, [split.isWide, selectedMenu, menus, selectMenu]);

  const renderRow = useCallback(
    ({ item: menu }: { item: ManagedMenu }) => (
      <MenuListRow
        menu={menu}
        selected={menu.id === selectedMenuId}
        isHidden={hiddenSet.has(menu.id)}
        isOnline={!!onlineMenuId && onlineMenuId === menu.id}
        itemCount={itemCountByMenuId.get(menu.id) ?? 0}
        onPress={selectMenu}
      />
    ),
    [selectedMenuId, hiddenSet, onlineMenuId, itemCountByMenuId, selectMenu],
  );

  const reorderRows = useMemo(
    () =>
      menus.map((menu) => ({
        id: menu.id,
        title: menu.name,
        subtitle: `${menu.categories.length} categories`,
      })),
    [menus],
  );

  const hiddenCount = menus.filter((m) => hiddenSet.has(m.id)).length;
  const addMenu = useCallback(() => router.push("/menu/add-menu"), []);

  const list = reordering ? (
    <ReorderList
      title="Menu order"
      rows={reorderRows}
      disabled={!canWrite}
      onDone={() => setReordering(false)}
      onReorder={(ids) => void actions.reorderMenus(ids)}
    />
  ) : (
    <Surface style={{ flex: 1 }}>
      <FlashList
        data={menus}
        extraData={renderRow}
        keyExtractor={(menu) => menu.id}
        renderItem={renderRow}
        estimatedItemSize={s(84)}
        ListEmptyComponent={
          <EmptyState
            icon={Layers}
            title="No menus yet"
            description="Create a menu, then add categories to it."
            action={
              <Button
                label="Add menu"
                icon={Plus}
                variant="primary"
                onPress={addMenu}
                disabled={!canWrite}
              />
            }
          />
        }
      />
    </Surface>
  );

  return (
    <View style={{ flex: 1, gap: s(12) }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
        <Text style={{ flex: 1, fontSize: s(13), color: colors.label }}>
          {`${menus.length} ${menus.length === 1 ? "menu" : "menus"}`}
          {hiddenCount > 0 ? ` · ${hiddenCount} hidden on this device` : ""}
        </Text>
        {menus.length > 1 && (
          <Button
            label="Reorder"
            icon={ArrowUpDown}
            onPress={() => {
              setReordering(true);
              // Narrow layout: the list pane has to be the one on screen.
              if (!split.isWide) selectMenu(null);
            }}
            disabled={!canWrite || reordering}
          />
        )}
        <Button
          label="Add menu"
          icon={Plus}
          variant="primary"
          onPress={addMenu}
          disabled={!canWrite}
        />
      </View>

      <SplitView
        split={split}
        list={list}
        detail={
          selectedMenu ? (
            <MenuDetail
              menu={selectedMenu}
              isHidden={hiddenSet.has(selectedMenu.id)}
              isOnline={!!onlineMenuId && onlineMenuId === selectedMenu.id}
              itemCountByCategoryId={itemCountByCategoryId}
            />
          ) : null
        }
        backLabel="All menus"
        onBack={() => selectMenu(null)}
        emptyDetail={{
          icon: Layers,
          title: "Select a menu",
          description: "Pick a menu to see its status, schedule and categories.",
        }}
      />
    </View>
  );
}

export default React.memo(MenusPanel);
