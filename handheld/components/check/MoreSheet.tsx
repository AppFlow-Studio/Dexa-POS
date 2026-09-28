import { Merge, Percent, Printer, Receipt, StickyNote, Trash2, Wallet } from "@/lib/icons";
import React from "react";
import { View } from "react-native";
import { BottomSheet } from "../../primitives";
import { ActionRow } from "./ActionRow";

/**
 * S5: discount, note, payments, merge, printing and void in one sheet, the
 * gated ones marked up front. Payments shows only once the check has one.
 */
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
  onPayments,
  onMerge,
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
  onPayments?: () => void;
  onMerge: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View className="pb-6 pt-1">
        <ActionRow icon={Percent} label="Apply discount" gated divider={false} onPress={onDiscount} />
        <ActionRow icon={StickyNote} label="Add a note" divider onPress={onNote} />
        {onPayments ? <ActionRow icon={Wallet} label="Payments" divider onPress={onPayments} /> : null}
        <ActionRow icon={Merge} label="Merge checks" divider onPress={onMerge} />
        <ActionRow icon={Receipt} label="Print the check" divider onPress={onPrintCheck} />
        <ActionRow icon={Printer} label="Print a kitchen ticket" divider onPress={onPrintKitchen} />
        <ActionRow icon={Trash2} label="Void order" gated danger divider onPress={onVoid} />
      </View>
    </BottomSheet>
  );
}
