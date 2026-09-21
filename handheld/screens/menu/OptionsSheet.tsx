import React from "react";
import { View } from "react-native";
import { NoteField } from "../../components/NoteField";
import type { ItemDraft } from "../../lib/cartItem";
import { formatCurrency } from "../../lib/format";
import { BottomSheet, SegmentedTabs, StickyActionBar } from "../../primitives";
import { OptionGroup } from "./OptionGroup";
import { QuantityRow } from "./Stepper";
import { useOptionsDraft, type OptionsTarget } from "./useOptionsDraft";

const SERVICE = [
  { value: "dine_in", label: "Dine in" },
  { value: "to_go", label: "To go" },
] as const;

/**
 * Screen 4: one item's options over the menu. Mount it keyed by the item so
 * the draft starts fresh each time; `onAdd` receives the register-shaped
 * draft once every required group has a pick. With `target.existing` set
 * it edits that line instead: seeded from it, and the button reads "Save".
 */
export function OptionsSheet({
  target,
  onAdd,
  onClose,
}: {
  target: OptionsTarget;
  onAdd: (draft: ItemDraft) => void;
  onClose: () => void;
}) {
  const draft = useOptionsDraft(target);
  const { item, existing } = target;
  const subtitle = [formatCurrency(existing ? (existing.baseCardPrice ?? existing.unitPrice) : item.price), item.description]
    .filter(Boolean)
    .join(" · ");
  const label = existing
    ? `Save · ${formatCurrency(draft.total)}`
    : `Add ${draft.quantity} to order · ${formatCurrency(draft.total)}`;

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
      <QuantityRow value={draft.quantity} onChange={draft.setQuantity} />
      {draft.groups.map((group) => (
        <OptionGroup
          key={group.id}
          group={group}
          selection={draft.selections[group.id]}
          error={draft.errors.includes(group.id)}
          onToggle={(optionId) => draft.toggle(group, optionId)}
        />
      ))}
      <View style={{ height: 12 }} />
      <NoteField value={draft.notes} onChange={draft.setNotes} placeholder="Note for the kitchen" label="Item note" minHeight={48} />
      <View className="h-2" />
    </BottomSheet>
  );
}
