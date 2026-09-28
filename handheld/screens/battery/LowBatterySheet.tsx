import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import type { EmployeeProfile } from "@/stores/useEmployeeStore";
import { BatteryLow } from "@/lib/icons";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { useConnectionStore } from "../../lib/connectionStore";
import { tint } from "../../lib/tokens";
import { transferTables } from "../../lib/transferServer";
import { type } from "../../lib/type";
import { BottomSheet, StickyActionBar } from "../../primitives";
import { ServerPickerSheet } from "./ServerPickerSheet";
import { TransferTableRow, TransferToRow } from "./TransferRows";
import type { MyOpenTable } from "./useMyOpenTables";

const plural = (n: number) => `${n} ${n === 1 ? "table" : "tables"}`;

/**
 * The artifact's low-battery sheet (`.bs`): the level, a rough time left,
 * the server's open tables (all ticked), who takes them, and "Transfer N
 * tables" / "Not now". Transfers need the backend, so offline the button
 * says so instead of failing table by table.
 */
export function LowBatterySheet({
  percent,
  minutesLeft,
  tables,
  onDone,
}: {
  percent: number;
  minutesLeft: number | null;
  tables: readonly MyOpenTable[];
  onDone: () => void;
}) {
  const supabase = useSupabaseClient();
  const offline = useConnectionStore((s) => s.state === "offline");
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(tables.map((t) => t.tableId)));
  const [to, setTo] = useState<EmployeeProfile | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = tables.filter((t) => picked.has(t.tableId));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const transfer = async () => {
    if (!to || chosen.length === 0) return;
    setBusy(true);
    const { moved, failed } = await transferTables(supabase, chosen, to);
    setBusy(false);
    if (failed > 0) {
      toastService.show({ title: "Transfer incomplete", message: `${plural(failed)} did not transfer. Try again.`, type: "error" });
    }
    if (moved > 0) {
      toastService.show({ title: "Tables transferred", message: `${plural(moved)} now with ${to.fullName}.`, type: "success" });
      if (failed === 0) onDone();
    }
  };

  const time = minutesLeft !== null ? `About ${minutesLeft} minutes left. ` : "";
  const label = busy ? "Transferring…" : to ? `Transfer ${plural(chosen.length)}` : "Choose who takes them";

  return (
    <BottomSheet
      visible
      onClose={onDone}
      footer={
        <StickyActionBar
          column
          actions={[
            { label, disabled: busy || offline || !to || chosen.length === 0, onPress: () => void transfer() },
            { label: "Not now", variant: "text", onPress: onDone },
          ]}
          hint={offline ? "Transfers need a connection" : undefined}
        />
      }
    >
      <View className="items-center" style={{ paddingHorizontal: 28, paddingTop: 12 }}>
        <View className="items-center justify-center" style={{ width: 56, height: 56, borderRadius: 18, marginTop: 6, marginBottom: 16, backgroundColor: tint.errSoft }}>
          <BatteryLow size={28} color={colors.danger} />
        </View>
        <Text style={[type.sheetTitle, { color: colors.heading }]}>Battery at {percent}%</Text>
        <Text className="mt-2 text-center" style={[type.messageDesc, { color: colors.label }]}>
          {time}Hand your open tables to someone before it runs out.
        </Text>
      </View>
      <View className="mx-4 overflow-hidden" style={{ marginTop: 20, borderRadius: 22, backgroundColor: colors.card }}>
        {tables.map((t, i) => (
          <TransferTableRow key={t.tableId} table={t} checked={picked.has(t.tableId)} divider={i > 0} onToggle={toggle} />
        ))}
      </View>
      <TransferToRow name={to?.fullName ?? null} onPress={() => setChoosing(true)} />
      {choosing ? (
        <ServerPickerSheet selectedId={to?.profileId ?? null} onPick={setTo} onClose={() => setChoosing(false)} />
      ) : null}
    </BottomSheet>
  );
}
