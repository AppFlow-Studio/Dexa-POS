import { Percent, Printer, Receipt, StickyNote, Trash2 } from "lucide-react-native";
import React from "react";
import { View } from "react-native";
import { BottomSheet } from "../../primitives";
import { ActionRow } from "./ActionRow";

/** S5: discount, note, printing and void in one sheet, the gated ones marked up front. */
export function MoreSheet({
  visible,
  title,
  subtitle,
  onClose,
  onDiscount,
  onNote,
  onPrintCheck,
  onPrintKitchen,
  onVoid,
}: {
  visible: boolean;
  title: string;
  subtitle: string;
  onClose: () => void;
  onDiscount: () => void;
  onNote: () => void;
  onPrintCheck: () => void;
  onPrintKitchen: () => void;
  onVoid: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View className="pb-6 pt-1">
        <ActionRow icon={Percent} label="Apply discount" gated divider={false} onPress={onDiscount} />
        <ActionRow icon={StickyNote} label="Add a note" divider onPress={onNote} />
        <ActionRow icon={Receipt} label="Print the check" divider onPress={onPrintCheck} />
        <ActionRow icon={Printer} label="Print a kitchen ticket" divider onPress={onPrintKitchen} />
        <ActionRow icon={Trash2} label="Void order" gated danger divider onPress={onVoid} />
      </View>
    </BottomSheet>
  );
}
