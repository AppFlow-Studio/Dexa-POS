/**
 * Categories tab: the category library on the left, the selected category and
 * its items on the right.
 *
 * The detail's items grid is virtualized (FlashList rows under a header that
 * carries the category's settings). The old tab expanded every category inline
 * and rendered all of its item cards at once inside a list cell.
 */
import { FlashList } from "@shopify/flash-list";
import { router } from "expo-router";
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

import { Switch } from "@/components/ui/switch";
import {
  useCategoryItemIndex,
  useCategoryOpenNow,
  useSortedCategories,
} from "@/hooks/menu/useMenuManagementData";
import {
  ArrowUpDown,
  CalendarClock,
  Globe,
  Layers,
  ListOrdered,
  Package,
  Pencil,
  Plus,
  SearchX,
} from "@/lib/icons";
import { formatScheduleSummary } from "@/lib/menu/menuSchedule";
import { getItemPlaceholderIcon } from "@/lib/menuItemPlaceholderIcon";
import { colors } from "@/lib/theme";
import type { Category, MenuItemType } from "@/lib/types";
import { useMenuManagementUiStore } from "@/stores/useMenuManagementUiStore";

import { useMenuManagement } from "./context";
import { ItemGrid } from "./ItemGrid";
import { DetailHeader, EntityRow, SplitView, useSplitLayout } from "./layout";
import { ReorderList } from "./ReorderList";
import {
  Button,
  EmptyState,
  Notice,
  Pill,
  SearchField,
  SectionLabel,
  SettingRow,
  Surface,
  useS,
} from "./ui";

const EMPTY_ITEMS: MenuItemType[] = [];
const NO_MENUS: { id: string; name: string }[] = [];

function CategoryStatusPills({
  isActive,
  openNow,
}: {
  isActive: boolean;
  openNow: boolean;
}) {
  if (!isActive) return <Pill size="sm" tone="danger" label="Inactive" />;
  if (!openNow) return <Pill size="sm" tone="danger" label="Off schedule" />;
  return <Pill size="sm" tone="success" label="Active" />;
}

const CategoryListRow = React.memo(function CategoryListRow({
  category,
  selected,
  openNow,
  itemCount,
  menuCount,
  onPress,
}: {
  category: Category;
  selected: boolean;
  openNow: boolean;
  itemCount: number;
  menuCount: number;
  onPress: (id: string) => void;
}) {
  return (
    <EntityRow
      id={category.id}
      title={category.name}
      subtitle={`${itemCount} ${itemCount === 1 ? "item" : "items"} · ${
        menuCount === 0
          ? "not in a menu"
          : `in ${menuCount} ${menuCount === 1 ? "menu" : "menus"}`
      }`}
      selected={selected}
      dimmed={!category.isActive}
      onPress={onPress}
      pills={<CategoryStatusPills isActive={category.isActive} openNow={openNow} />}
    />
  );
});

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

interface CategoryDetailProps {
  category: Category;
  items: MenuItemType[];
  canReorderItems: boolean;
  menus: { id: string; name: string }[];
  openNow: boolean;
}

const CategoryDetail = React.memo(function CategoryDetail({
  category,
  items,
  canReorderItems,
  menus,
  openNow,
}: CategoryDetailProps) {
  const s = useS();
  const { actions, canWrite } = useMenuManagement();
  const openMenu = useMenuManagementUiStore((st) => st.openMenu);
  const menuContextId = useMenuManagementUiStore((st) => st.categoryMenuContextId);
  const clearMenuContext = useMenuManagementUiStore(
    (st) => st.clearCategoryMenuContext,
  );
  const editable = actions.isEntityEditable(category.location_id);
  const [reordering, setReordering] = useState(false);
  const scheduleSummary = formatScheduleSummary(category.schedules);
  // Opened from a menu: prices edited here are that menu's prices (level 5).
  // Otherwise they are this category's prices at this location (level 4).
  const pricingMenu = menus.find((m) => m.id === menuContextId) ?? null;
  const pricingMenuId = pricingMenu?.id ?? null;
  const openContext = useMemo(
    () => ({ categoryId: category.id, menuId: pricingMenuId }),
    [category.id, pricingMenuId],
  );

  useEffect(() => {
    setReordering(false);
  }, [category.id]);

  const reorderRows = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        title: item.name,
        image: item.image,
        placeholderIcon: getItemPlaceholderIcon(item),
      })),
    [items],
  );

  if (reordering) {
    return (
      <ReorderList
        title={`Item order in ${category.name}`}
        rows={reorderRows}
        disabled={!canWrite}
        onDone={() => setReordering(false)}
        onReorder={(_ids, from, to) =>
          void actions.reorderCategoryItems(category.id, from, to)
        }
      />
    );
  }

  const settings = (
    <View style={{ gap: s(18), paddingBottom: s(12) }}>
      {pricingMenu && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(10),
            paddingLeft: s(12),
            paddingRight: s(6),
            paddingVertical: s(6),
            borderRadius: s(10),
            borderWidth: 1,
            borderColor: colors.teal + "40",
            backgroundColor: colors.teal + "12",
          }}
        >
          <Layers size={s(16)} color={colors.teal} />
          <Text style={{ flex: 1, fontSize: s(13), color: colors.heading }}>
            Opened from{" "}
            <Text style={{ fontWeight: "700" }}>{pricingMenu.name}</Text>. Item
            prices you set here apply to that menu only.
          </Text>
          <Button
            size="sm"
            label="Use category prices"
            onPress={clearMenuContext}
          />
        </View>
      )}
      {!editable && (
        <Notice icon={Globe}>
          This category is shared across your locations, so it is edited in
          Dexa Admin. Item price and availability can still be set here.
        </Notice>
      )}
      <View>
        <SectionLabel>Availability</SectionLabel>
        <Surface>
          <SettingRow
            title="Active"
            description="When off, this category and its items are hidden everywhere."
            right={
              <Switch
                checked={category.isActive}
                onCheckedChange={() => void actions.toggleCategoryActive(category.id)}
                disabled={!editable || !canWrite}
                accessibilityLabel={`${category.name} active`}
              />
            }
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(10),
              paddingVertical: s(12),
              paddingHorizontal: s(14),
            }}
          >
            <CalendarClock size={s(18)} color={colors.label} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: s(14), color: colors.heading }}>
                {scheduleSummary || "Always available"}
              </Text>
              <Text style={{ fontSize: s(12), color: colors.muted }}>
                {openNow ? "Open right now" : "Closed right now"} · schedules are
                managed in Dexa Admin
              </Text>
            </View>
          </View>
        </Surface>
      </View>

      <View>
        <SectionLabel>{`In menus (${menus.length})`}</SectionLabel>
        {menus.length === 0 ? (
          <Text style={{ fontSize: s(13), color: colors.muted }}>
            {"Not in any menu, so it doesn't show on the POS yet."}
          </Text>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
            {menus.map((menu) => (
              <TouchableOpacity
                key={menu.id}
                onPress={() => openMenu(menu.id)}
                accessibilityRole="button"
                accessibilityLabel={`Open menu ${menu.name}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                  height: s(34),
                  paddingHorizontal: s(12),
                  borderRadius: s(17),
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Layers size={s(14)} color={colors.label} />
                <Text style={{ fontSize: s(13), fontWeight: "500", color: colors.heading }}>
                  {menu.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <SectionLabel
        right={
          canReorderItems && items.length > 1 ? (
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
        {`Items (${items.length})`}
      </SectionLabel>
    </View>
  );

  return (
    <Surface style={{ flex: 1 }}>
      <DetailHeader
        title={category.name}
        pills={<CategoryStatusPills isActive={category.isActive} openNow={openNow} />}
        actions={
          editable ? (
            <Button
              label="Edit"
              icon={Pencil}
              onPress={() => router.push(`/menu/edit-category?id=${category.id}`)}
              disabled={!canWrite}
            />
          ) : null
        }
      />
      <View style={{ flex: 1, paddingHorizontal: s(16), paddingTop: s(16) }}>
        <ItemGrid
          items={items}
          header={settings}
          openContext={openContext}
          empty={
            <EmptyState
              icon={Package}
              title="No items in this category"
              description="Add items to it from the item's editor or Dexa Admin."
            />
          }
        />
      </View>
    </Surface>
  );
});

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function CategoriesPanel() {
  const s = useS();
  const { canWrite } = useMenuManagement();
  const categories = useSortedCategories();
  const { itemsByCategoryId, orderedCategoryIds, menusByCategoryId } =
    useCategoryItemIndex();
  const openNowById = useCategoryOpenNow();
  const search = useMenuManagementUiStore((st) => st.categorySearch);
  const setSearch = useMenuManagementUiStore((st) => st.setCategorySearch);
  const deferredSearch = useDeferredValue(search);
  const selectedId = useMenuManagementUiStore((st) => st.selectedCategoryId);
  const selectCategory = useMenuManagementUiStore((st) => st.selectCategory);
  const split = useSplitLayout();

  const visibleCategories = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(query));
  }, [categories, deferredSearch]);

  const selected = categories.find((c) => c.id === selectedId) ?? null;

  useEffect(() => {
    if (split.isWide && !selected && visibleCategories.length > 0) {
      selectCategory(visibleCategories[0].id);
    }
  }, [split.isWide, selected, visibleCategories, selectCategory]);

  const renderRow = useCallback(
    ({ item: category }: { item: Category }) => (
      <CategoryListRow
        category={category}
        selected={category.id === selectedId}
        openNow={openNowById.get(category.id) ?? true}
        itemCount={itemsByCategoryId.get(category.id)?.length ?? 0}
        menuCount={menusByCategoryId.get(category.id)?.length ?? 0}
        onPress={selectCategory}
      />
    ),
    [selectedId, openNowById, itemsByCategoryId, menusByCategoryId, selectCategory],
  );

  const addCategory = useCallback(() => router.push("/menu/add-category"), []);

  const list = (
    <Surface style={{ flex: 1 }}>
      <View
        style={{
          padding: s(10),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <SearchField
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories"
        />
      </View>
      <FlashList
        data={visibleCategories}
        extraData={renderRow}
        keyExtractor={(category) => category.id}
        renderItem={renderRow}
        estimatedItemSize={s(84)}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          search.trim() ? (
            <EmptyState icon={SearchX} title="No categories match" />
          ) : (
            <EmptyState
              icon={ListOrdered}
              title="No categories yet"
              description="Categories group items on the POS order screen."
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
          {`${categories.length} ${categories.length === 1 ? "category" : "categories"}`}
        </Text>
        <Button
          label="Add category"
          icon={Plus}
          variant="primary"
          onPress={addCategory}
          disabled={!canWrite}
        />
      </View>

      <SplitView
        split={split}
        list={list}
        detail={
          selected ? (
            <CategoryDetail
              category={selected}
              items={itemsByCategoryId.get(selected.id) ?? EMPTY_ITEMS}
              canReorderItems={orderedCategoryIds.has(selected.id)}
              menus={menusByCategoryId.get(selected.id) ?? NO_MENUS}
              openNow={openNowById.get(selected.id) ?? true}
            />
          ) : null
        }
        backLabel="All categories"
        onBack={() => selectCategory(null)}
        emptyDetail={{
          icon: ListOrdered,
          title: "Select a category",
          description: "Pick a category to see its items and where it appears.",
        }}
      />
    </View>
  );
}

export default React.memo(CategoriesPanel);
