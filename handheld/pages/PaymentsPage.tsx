import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, View } from "react-native";
import { ManagerPinScreen } from "../components/check/ManagerPinScreen";
import { Totals } from "../components/check/Totals";
import { EmptyState } from "../components/EmptyState";
import { OfflineBanner } from "../components/OfflineBanner";
import { checkTitle } from "../lib/checks";
import { paymentsOf, paymentTitle } from "../lib/paymentRecords";
import { PageHeader } from "../primitives";
import { PaymentRow } from "../screens/payments/PaymentRow";
import { PaymentSheet } from "../screens/payments/PaymentSheet";
import { TipAdjustSheet } from "../screens/payments/TipAdjustSheet";

type Step = "actions" | "tip" | "approval" | null;

/**
 * The payments already on a check, from the check's More sheet. Tapping one
 * offers tip adjust and refund; refund asks a manager first, then opens the
 * refund page with the approver's name. Totals under the list reconcile the
 * payments against the check.
 */
export default function PaymentsPage({ orderId }: { orderId: string }) {
  const router = useRouter();
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const payments = useMemo(() => paymentsOf(order), [order]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(null);
  const selected = payments.find((p) => p.id === selectedId) ?? null;

  const open = useCallback((id: string) => {
    setSelectedId(id);
    setStep("actions");
  }, []);
  const close = useCallback(() => setStep(null), []);

  const approved = (managerName: string) => {
    setStep(null);
    if (!selected) return;
    router.push({
      pathname: "/handheld/refund/[orderId]",
      params: { orderId, paymentId: selected.id, approvedBy: managerName },
    });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title="Payments" subtitle={order ? checkTitle(order) : undefined} onBack={() => router.back()} />
      <OfflineBanner />
      {payments.length === 0 ? (
        <EmptyState title="No payments yet" hint="Payments taken on this check show up here." />
      ) : (
        <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 24 }}>
          {payments.map((p, i) => (
            <PaymentRow key={p.id} payment={p} divider={i > 0} onPress={open} />
          ))}
          {order ? (
            <View className="pt-3">
              <Totals order={order} />
            </View>
          ) : null}
        </ScrollView>
      )}
      {selected && step === "actions" ? (
        <PaymentSheet
          payment={selected}
          onClose={close}
          onAdjustTip={() => setStep("tip")}
          onRefund={() => setStep("approval")}
        />
      ) : null}
      {selected && step === "tip" ? <TipAdjustSheet orderId={orderId} payment={selected} onClose={close} /> : null}
      {selected && step === "approval" ? (
        <ManagerPinScreen action={`Refund ${paymentTitle(selected)}`} onApproved={approved} onCancel={close} />
      ) : null}
    </View>
  );
}
