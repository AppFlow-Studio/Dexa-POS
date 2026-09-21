import { colors } from "@/lib/theme";
import React from "react";
import { Text, View } from "react-native";
import { type } from "../../lib/type";
import { SwitchRow } from "../../primitives";

/**
 * The "Ordering" group: the per-order PIN switch and what it does. The
 * switch shows the stored value; the tap goes to `onRequest`, which puts up
 * the manager PIN screen (MeScreen mounts it at screen level so it covers
 * the list), and only an approval moves the switch.
 */
export function OrderingRows({ requirePin, onRequest }: { requirePin: boolean; onRequest: (next: boolean) => void }) {
  return (
    <View>
      <SwitchRow label="Require PIN per order" value={requirePin} onChange={onRequest} />
      <Text className="px-5" style={[type.sheetDesc, { paddingBottom: 12, color: colors.label }]}>
        Ask for a staff PIN before each new order or seating, and credit that staff as the
        order&apos;s creator. For handhelds passed between staff. Changing this asks for a manager PIN.
      </Text>
    </View>
  );
}
