import { FlashList, type ListRenderItem } from "@shopify/flash-list";
import React, { useCallback, useState } from "react";
import { EmptyState } from "../../components/EmptyState";
import { useMinuteTick } from "../../hooks/useMinuteTick";
import { Screen, SegmentedTabs, type SegmentedOption } from "../../primitives";
import { CheckDetailSheet } from "./CheckDetailSheet";
import { CheckRow } from "./CheckRow";
import { useOpenChecks, type ChecksScope } from "./useOpenChecks";

/** Row height hint for FlashList's first layout pass (dp). */
const ESTIMATED_ROW_HEIGHT = 64;

const keyExtractor = (orderId: string) => orderId;

/** Artifact screen S1 — open checks, Mine / All. Read-only in this wave. */
export function ChecksScreen() {
  const [scope, setScope] = useState<ChecksScope>("mine");
  const { mine, all } = useOpenChecks();
  const now = useMinuteTick();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeSheet = useCallback(() => setSelectedId(null), []);

  const options: readonly SegmentedOption<ChecksScope>[] = [
    { value: "mine", label: "Mine", count: mine.length },
    { value: "all", label: "All", count: all.length },
  ];
  const rows = scope === "mine" ? mine : all;

  const renderItem = useCallback<ListRenderItem<string>>(
    ({ item }) => <CheckRow orderId={item} now={now} onPress={setSelectedId} />,
    [now],
  );

  return (
    <Screen title="Checks">
      <SegmentedTabs value={scope} options={options} onChange={setScope} />
      {rows.length === 0 ? (
        <EmptyState
          title={scope === "mine" ? "No open checks of yours" : "No open checks"}
          hint={scope === "mine" ? "Switch to All to see the whole floor." : undefined}
        />
      ) : (
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          estimatedItemSize={ESTIMATED_ROW_HEIGHT}
          extraData={now}
        />
      )}
      <CheckDetailSheet orderId={selectedId} onClose={closeSheet} />
    </Screen>
  );
}
