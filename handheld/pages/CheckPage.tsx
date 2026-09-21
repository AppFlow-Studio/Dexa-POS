import { useTableCoursing } from "@/hooks/useTableCoursing";
import { colors } from "@/lib/theme";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import { MoreVertical } from "lucide-react-native";
import React, { useCallback, useEffect } from "react";
import { ScrollView, Text, View } from "react-native";
import { CheckBody } from "../components/check/CheckBody";
import { CheckFooter } from "../components/check/CheckFooter";
import { DiscountSheet } from "../components/check/DiscountSheet";
import { ManagerPinScreen } from "../components/check/ManagerPinScreen";
import { MoreSheet } from "../components/check/MoreSheet";
import { NoteSheet } from "../components/check/NoteSheet";
import { TakeOverCard, useIsReadOnly } from "../components/check/TakeOverCard";
import { useCheckActions } from "../components/check/useCheckActions";
import { OfflineBanner } from "../components/OfflineBanner";
import { isTableCheck } from "../lib/sendCourse";
import { type } from "../lib/type";
import { IconButton, PageHeader } from "../primitives";

/**
 * Makes the check the station's active order while the page is up (every
 * write in the store targets the active order) and keeps the coursing store
 * initialised for table checks, as TableOrderView does on the register.
 */
function useActiveCheck(orderId: string) {
  const order = useOrderStore((s) => s.ordersById[orderId]);
  const coursing = useLocationConfigStore((s) => s.config.dining.enableCoursing);
  useTableCoursing(order, coursing && !!order && isTableCheck(order));
  useEffect(() => {
    const store = useOrderStore.getState();
    if (store.ordersById[orderId] && store.activeOrderId !== orderId) store.setActiveOrder(orderId);
  }, [orderId]);
}

/**
 * The check with its actions. A check another station owns is read-only
 * (the register's rule) until "Take over" claims it: no more button, no
 * "Add items", no Send.
 */
function OpenCheck({ title, subtitle, orderId }: { title: string; subtitle?: string; orderId: string }) {
  const router = useRouter();
  useActiveCheck(orderId);
  const readOnly = useIsReadOnly(orderId);
  const actions = useCheckActions(orderId, useCallback(() => router.back(), [router]));
  const addItems = useCallback(
    () => router.push({ pathname: "/handheld/menu/[orderId]", params: { orderId } }),
    [router, orderId],
  );

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        onBack={() => router.back()}
        right={
          readOnly ? undefined : (
            <IconButton label="More" onPress={() => actions.setSheet("more")}>
              <MoreVertical size={24} color={colors.heading} />
            </IconButton>
          )
        }
      />
      <OfflineBanner />
      {readOnly ? <TakeOverCard orderId={orderId} /> : null}
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
        <CheckBody orderId={orderId} onAddItems={readOnly ? undefined : addItems} />
      </ScrollView>
      {readOnly ? null : <CheckFooter orderId={orderId} />}
      <MoreSheet
        visible={actions.sheet === "more"}
        title={title}
        subtitle={subtitle ?? ""}
        onClose={actions.close}
        onDiscount={() => actions.request("discount")}
        onNote={() => actions.setSheet("note")}
        onPrintCheck={actions.printCheck}
        onPrintKitchen={actions.printKitchenTicket}
        onVoid={() => actions.request("void")}
      />
      {actions.sheet === "discount" ? <DiscountSheet orderId={orderId} onClose={actions.close} /> : null}
      {actions.sheet === "note" ? <NoteSheet orderId={orderId} onSave={actions.saveNote} onClose={actions.close} /> : null}
      {actions.approval ? (
        <ManagerPinScreen action={actions.approvalLabel} onApproved={actions.approved} onCancel={actions.cancelApproval} />
      ) : null}
    </>
  );
}

/**
 * The pushed check page shared by tables and orders: `.bar` header with the
 * "more" button, the offline card, course cards, totals and the Send footer.
 * Without an order it explains why (Wave 3 adds "Start a check" here).
 */
export function CheckPage({
  title,
  subtitle,
  orderId,
  emptyText,
}: {
  title: string;
  subtitle?: string;
  orderId: string | null;
  emptyText: string;
}) {
  const router = useRouter();
  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      {orderId ? (
        <OpenCheck title={title} subtitle={subtitle} orderId={orderId} />
      ) : (
        <>
          <PageHeader title={title} subtitle={subtitle} onBack={() => router.back()} />
          <OfflineBanner />
          <Text className="px-5 pt-2" style={[type.sheetDesc, { color: colors.label }]}>
            {emptyText}
          </Text>
        </>
      )}
    </View>
  );
}
