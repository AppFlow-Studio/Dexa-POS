import { useColorScheme } from "@/lib/useColorScheme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Avatar } from "../../components/Avatar";
import { EmptyState } from "../../components/EmptyState";
import { Fab } from "../../components/Fab";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import { metrics } from "../../lib/tokens";
import { Screen, SegmentedTabs, type SegmentedOption } from "../../primitives";
import { CheckRow } from "./CheckRow";
import { useChecks, type ChecksScope } from "./useChecks";

const keyExtractor = (orderId: string) => orderId;

/** Artifact screen S1 — every open order. Tapping a row pushes its page; the FAB starts one (S2). */
export function ChecksScreen() {
  const router = useRouter();
  const { isDarkColorScheme: dark } = useColorScheme();
  const [scope, setScope] = useState<ChecksScope>("open");
  const { open, closed } = useChecks();
  const now = useMinuteTick();
  const myName = useEmployeeStore((s) => s.loggedInEmployee?.displayName ?? "");

  const openOrder = useCallback(
    (id: string) => router.push({ pathname: "/handheld/order/[id]", params: { id } }),
    [router],
  );
  const newOrder = useCallback(() => router.push("/handheld/order/new"), [router]);

  const rows = scope === "open" ? open : closed;
  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item, index }) => (
      <CheckRow orderId={item} now={now} divider={index > 0} dark={dark} onPress={openOrder} />
    ),
    [now, dark, openOrder],
  );

  const options: readonly SegmentedOption<ChecksScope>[] = [
    { value: "open", label: "Open", count: open.length },
    { value: "closed", label: "Closed", count: closed.length },
  ];

  return (
    <Screen
      title="Checks"
      subtitle={`${open.length} open`}
      right={myName ? <Avatar name={myName} /> : undefined}
    >
      <SegmentedTabs value={scope} options={options} onChange={setScope} />
      {rows.length === 0 ? (
        <EmptyState
          title={scope === "open" ? "No open checks" : "No closed checks yet"}
          hint={
            scope === "open"
              ? "Orders started on any station show up here."
              : "Checks closed on this shift show up here."
          }
        />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={metrics.row}
          extraData={renderItem}
          contentContainerStyle={{ paddingBottom: 88 }}
        />
      )}
      <Fab label="New order" onPress={newOrder} />
    </Screen>
  );
}
