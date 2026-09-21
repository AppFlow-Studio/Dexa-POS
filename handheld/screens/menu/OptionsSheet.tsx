import { colors } from "@/lib/theme";
import { Minus, Plus } from "lucide-react-native";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatCurrency } from "../../lib/format";
import type { ItemDraft } from "../../lib/cartItem";
import { type } from "../../lib/type";
import { BottomSheet, SegmentedTabs, StickyActionBar } from "../../primitives";
import { OptionGroup } from "./OptionGroup";
import type { MenuRowData } from "./useMenuRows";
import { useOptionsDraft } from "./useOptionsDraft";

function StepKey({ label, icon, onPress }: { label: string; icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-10 w-10 items-center justify-center rounded-full"
    >
      {icon}
    </Pressable>
  );
}

/** The artifact's `.stp`: a 48dp pill with 40dp minus / plus discs around the count. */
function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View className="flex-row items-center rounded-full px-1" style={{ minHeight: 48, backgroundColor: colors.card }}>
      <StepKey label="Fewer" icon={<Minus size={20} color={colors.teal} strokeWidth={2.2} />} onPress={() => onChange(value - 1)} />
      <Text className="text-center" style={[type.tile, { minWidth: 28, color: colors.heading }]}>
        {value}
      </Text>
      <StepKey label="More" icon={<Plus size={20} color={colors.teal} strokeWidth={2.2} />} onPress={() => onChange(value + 1)} />
    </View>
  );
}

const SERVICE = [
  { value: "dine_in", label: "Dine in" },
  { value: "to_go", label: "To go" },
] as const;

/**
 * Screen 4: one item's options over the menu. Mount it keyed by the item so
 * the draft starts fresh each time; `onAdd` receives the register-shaped
 * draft once every required group has a pick.
 */
export function OptionsSheet({
  target,
  onAdd,
  onClose,
}: {
  target: MenuRowData;
  onAdd: (draft: ItemDraft) => void;
  onClose: () => void;
}) {
  const draft = useOptionsDraft(target);
  const { item } = target;
  const subtitle = [formatCurrency(item.price), item.description].filter(Boolean).join(" · ");
  const label = `Add ${draft.quantity} to order · ${formatCurrency(draft.total)}`;

  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={item.name}
      subtitle={subtitle}
      footer={
        <StickyActionBar
          actions={[
            {
              label,
              onPress: () => {
                const done = draft.commit();
                if (done) onAdd(done);
              },
            },
          ]}
        />
      }
    >
      <SegmentedTabs
        value={draft.isToGo ? "to_go" : "dine_in"}
        options={SERVICE}
        onChange={(v) => draft.setToGo(v === "to_go")}
      />
      <View className="flex-row items-center justify-between px-5">
        <Text style={[type.row, { fontWeight: "400", color: colors.heading }]}>Quantity</Text>
        <Stepper value={draft.quantity} onChange={draft.setQuantity} />
      </View>
      {draft.groups.map((group) => (
        <OptionGroup
          key={group.id}
          group={group}
          selection={draft.selections[group.id]}
          error={draft.errors.includes(group.id)}
          onToggle={(optionId) => draft.toggle(group, optionId)}
        />
      ))}
      <View className="h-4" />
    </BottomSheet>
  );
}
