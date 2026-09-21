import { isKitchenItemUnsent } from "@/lib/kitchenStatusUtils";
import { colors } from "@/lib/theme";
import type { CartItem, OrderProfile } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { useMinuteTick } from "../hooks/useMinuteTick";
import { checkPageTitle, orderKind } from "../lib/checks";
import { Button, PageHeader } from "../primitives";
import { CartButton } from "../screens/menu/CartButton";
import { CategoryChips } from "../screens/menu/CategoryChips";
import { CustomItemSheet } from "../screens/menu/CustomItemSheet";
import { MenuRow } from "../screens/menu/MenuRow";
import { OptionsSheet } from "../screens/menu/OptionsSheet";
import { SearchField } from "../screens/menu/SearchField";
import { useAddItem } from "../screens/menu/useAddItem";
import { useMenuRows, type MenuRowData } from "../screens/menu/useMenuRows";

/** Items not yet sent, summed by `pick` — the footer's count and running total. */
function sumUnsent(order: OrderProfile | undefined, pick: (item: CartItem) => number): number {
  let sum = 0;
  for (const i of order?.items ?? []) {
    if (i.is_voided || i.isDraft || !isKitchenItemUnsent(i)) continue;
    sum += pick(i);
  }
  return sum;
}

/** "Course 2" on a coursed dine-in check, otherwise the unsent count. */
function useSubtitle(orderId: string, unsentCount: number): string {
  const dineIn = useOrderStore((s) => {
    const o = s.ordersById[orderId];
    return o ? orderKind(o) === "dine_in" : false;
  });
  const coursing = useLocationConfigStore((s) => s.config.dining.enableCoursing);
  const course = useCoursingStore((s) => s.byOrderId[orderId]?.workingCourse ?? 1);
  const items = unsentCount === 1 ? "1 item to send" : `${unsentCount} items to send`;
  return dineIn && coursing ? `Course ${course} · ${items}` : items;
}

/** Screen 3: search or browse, one item per row; the sheet handles options. Route: /handheld/menu/[orderId]. */
export default function MenuPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const now = useMinuteTick();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const { chips, rows, inOrder } = useMenuRows(orderId, chip, query, now);
  const { pending, add, commit, dismiss } = useAddItem(orderId);

  const title = useOrderStore((s) => (s.ordersById[orderId] ? checkPageTitle(s.ordersById[orderId]) : "Menu"));
  const unsentCount = useOrderStore((s) => sumUnsent(s.ordersById[orderId], (i) => i.quantity));
  const unsentTotal = useOrderStore((s) => sumUnsent(s.ordersById[orderId], (i) => i.price * i.quantity));
  const subtitle = useSubtitle(orderId, unsentCount);

  useEffect(() => {
    if (!chip || !chips.some((c) => c.key === chip)) setChip(chips[0]?.key ?? null);
  }, [chips, chip]);

  const renderItem = ({ item, index }: { item: MenuRowData; index: number }) => (
    <MenuRow row={item} count={inOrder[item.item.id] ?? 0} divider={index > 0} onPress={add} />
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title={title} subtitle={subtitle} onBack={() => router.back()} />
      <SearchField value={query} onChange={setQuery} placeholder="Search the menu" />
      {query.trim() ? null : <CategoryChips chips={chips} active={chip} onChange={setChip} />}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.item.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        windowSize={5}
        ListEmptyComponent={
          <EmptyState
            title={query.trim() ? "Nothing matches" : "Nothing on the menu right now"}
            hint={query.trim() ? "Try another name, or add a custom item." : "Check the menu schedule on the register."}
          />
        }
        ListFooterComponent={
          <View className="items-center px-4 pb-4 pt-2">
            <Button label="Add a custom item" variant="text" fit onPress={() => setCustom(true)} />
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />
      <CartButton count={unsentCount} total={unsentTotal} onPress={() => router.back()} />
      {pending ? <OptionsSheet key={pending.item.id} target={pending} onAdd={commit} onClose={dismiss} /> : null}
      {custom ? (
        <CustomItemSheet
          onClose={() => setCustom(false)}
          onAdd={(item) => {
            useOrderStore.getState().addItemToActiveOrder(item);
            setCustom(false);
          }}
        />
      ) : null}
    </View>
  );
}
