import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { SearchField } from "../components/SearchField";
import { useMinuteTick } from "../hooks/useMinuteTick";
import { Button, ChipRow, PageHeader, type HeaderPicker } from "../primitives";
import { CartButton } from "../screens/menu/CartButton";
import { CoursePickerSheet } from "../screens/menu/CoursePickerSheet";
import { CustomItemSheet } from "../screens/menu/CustomItemSheet";
import { MenuRow } from "../screens/menu/MenuRow";
import { OptionsSheet } from "../screens/menu/OptionsSheet";
import { SeatPickerSheet } from "../screens/menu/SeatPickerSheet";
import { useAddItem } from "../screens/menu/useAddItem";
import { useMenuRows, type MenuRowData } from "../screens/menu/useMenuRows";
import { useMenuTotals } from "../screens/menu/useMenuTotals";
import { useSeatCourse, type SeatCourse } from "../screens/menu/useSeatCourse";

type Sheet = "seat" | "course" | "custom" | null;

/** The header's "Course 2" / "Seat 2" pills, only where the check has courses / seats. */
function pickers(sc: SeatCourse, open: (sheet: Sheet) => void): HeaderPicker[] {
  const list: HeaderPicker[] = [];
  if (sc.course.enabled) list.push({ label: `Course ${sc.course.current}`, onPress: () => open("course"), accessibilityLabel: "Course" });
  if (sc.seat.enabled) list.push({ label: sc.seat.active ? `Seat ${sc.seat.active}` : "Shared", onPress: () => open("seat"), accessibilityLabel: "Seat" });
  return list;
}

/** Screen 3: search or browse, one item per row; the sheet handles options. Route: /handheld/menu/[orderId]. */
export default function MenuPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const now = useMinuteTick();
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const { chips, rows, inOrder } = useMenuRows(orderId, chip, query, now);
  const sc = useSeatCourse(orderId);
  const { pending, add, commit, addCartItem, dismiss } = useAddItem(orderId, sc.seat.enabled ? sc.seat.active : undefined);
  const { title, subtitle, unsentCount, unsentTotal } = useMenuTotals(orderId);

  useEffect(() => {
    if (!chip || !chips.some((c) => c.key === chip)) setChip(chips[0]?.key ?? null);
  }, [chips, chip]);

  const renderItem = ({ item, index }: { item: MenuRowData; index: number }) => (
    <MenuRow row={item} count={inOrder[item.item.id] ?? 0} divider={index > 0} onPress={add} />
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title={title} subtitle={subtitle} picker={pickers(sc, setSheet)} onBack={() => router.back()} />
      <SearchField value={query} onChange={setQuery} placeholder="Search the menu" />
      {query.trim() ? null : <ChipRow chips={chips} active={chip} onChange={setChip} />}
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
            <Button label="Add a custom item" variant="text" fit onPress={() => setSheet("custom")} />
          </View>
        }
        contentContainerStyle={{ flexGrow: 1 }}
      />
      <CartButton count={unsentCount} total={unsentTotal} onPress={() => router.back()} />
      {pending ? <OptionsSheet key={pending.item.id} target={pending} onAdd={commit} onClose={dismiss} /> : null}
      {sheet === "custom" ? (
        <CustomItemSheet
          seatNumber={sc.seat.enabled ? sc.seat.active : undefined}
          onClose={() => setSheet(null)}
          onAdd={(item) => {
            addCartItem(item);
            setSheet(null);
          }}
        />
      ) : null}
      {sheet === "seat" ? (
        <SeatPickerSheet
          orderId={orderId}
          count={sc.seat.count}
          value={sc.seat.active}
          onPick={(seat) => {
            sc.seat.set(seat);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
      {sheet === "course" ? (
        <CoursePickerSheet
          orderId={orderId}
          value={sc.course.current}
          onPick={(course) => {
            sc.course.set(course);
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      ) : null}
    </View>
  );
}
