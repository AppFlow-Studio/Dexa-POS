import { useKioskDialog } from "@/components/kiosk/shared/KioskDialog";
import { kioskMoney } from "@/components/kiosk/shared/kioskMoney";
import { useRefundMutation } from "@/hooks/orders/useRefundMutation";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { AlertCircle, ArrowLeft, CreditCard, Receipt, Undo2 } from "@/lib/icons";
import type { EmployeeProfile } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { round2 } from "@/utils/money";
import {
  buildRefundDetails,
  dateTimeLabel,
  DETAIL_SELECT,
  isCollected,
  isVoidedOrder,
  orderNumber,
  orderState,
  orderTypeLabel,
  paymentLabel,
  paymentStatusLabel,
  REFUND_REASONS,
  summarizePayments,
  wholeChargeCancelTotal,
  timeLabel,
  type OrderDetailRow,
} from "./kioskOrders";
import {
  Card,
  Chip,
  ErrorCard,
  SectionBlock,
  StateCard,
  StatusPill,
  TEAL,
} from "./KioskOrdersUi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Decimal from "decimal.js";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

/**
 * One order in Kiosk Settings → Orders: summary, items and totals, card
 * transactions, and the refund card. Read once when opened. Key it by order
 * id so each order starts from the top with a fresh refund form.
 */
export function KioskOrderDetail({
  orderId,
  staff,
  onBack,
}: {
  orderId: string;
  staff: EmployeeProfile | null;
  /** "All orders"; disabled while a refund runs so its progress stays on screen. */
  onBack: () => void;
}) {
  const supabase = useSupabaseClient();
  const queryClient = useQueryClient();
  const refund = useRefundMutation();

  const detailQuery = useQuery({
    queryKey: ["kioskOrders", "detail", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(DETAIL_SELECT)
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const order = data as unknown as OrderDetailRow;
      // Oldest payment first, so a custom amount is taken from it first.
      order.order_payments?.sort((a, b) =>
        (a.initiated_at ?? "").localeCompare(b.initiated_at ?? ""),
      );
      return order;
    },
    enabled: !!supabase,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const order = detailQuery.data;

  const handleRefund = async (input: RefundSubmit) => {
    if (!order) return false;
    const station = useStoreSettingsStore.getState().selectedStation;
    try {
      await refund.mutateAsync({
        ...input,
        orderId: order.id,
        dbOrderId: order.id,
        paymentTerminalId: station?.payment_terminal?.id ?? "",
        paymentTerminal: station?.payment_terminal ?? undefined,
        stationId: station?.id,
        initiatedBy: staff?.profileId,
      });
      return true;
    } catch {
      // useRefundMutation already showed the failure.
      return false;
    } finally {
      // Re-read the balance either way: a failed batch can still have
      // refunded one of several payments.
      detailQuery.refetch();
      queryClient.invalidateQueries({ queryKey: ["kioskOrders", "list"] });
    }
  };

  return (
    <ScrollView
      className="flex-1"
      contentContainerStyle={{ gap: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity
        onPress={onBack}
        disabled={refund.isPending}
        className="flex-row items-center self-start py-1"
        style={{ opacity: refund.isPending ? 0.4 : 1 }}
      >
        <ArrowLeft size={20} color={TEAL} />
        <Text className="text-base font-bold text-teal-700 ml-2">
          All orders
        </Text>
      </TouchableOpacity>

      {detailQuery.isPending ? (
        <StateCard>
          <ActivityIndicator color={TEAL} />
          <Text className="text-sm text-gray-500 mt-3">Loading order…</Text>
        </StateCard>
      ) : detailQuery.isError || !order ? (
        <ErrorCard
          message="Couldn't load this order. Check the connection and try again."
          onRetry={() => detailQuery.refetch()}
        />
      ) : (
        <>
          <OrderSummary order={order} />
          <OrderItems order={order} />
          <OrderTransactions order={order} />
          <RefundCard
            order={order}
            staff={staff}
            processing={refund.isPending}
            onRefund={handleRefund}
          />
        </>
      )}
    </ScrollView>
  );
}

function OrderSummary({ order }: { order: OrderDetailRow }) {
  const meta = [orderTypeLabel(order.order_type), order.customer_name]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card>
      <View className="px-5 py-5 flex-row items-start">
        <View className="flex-1 pr-3">
          <Text className="text-2xl font-bold text-gray-900">
            {orderNumber(order)}
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            {dateTimeLabel(order.created_at)}
          </Text>
          {meta ? <Text className="text-sm text-gray-500 mt-0.5">{meta}</Text> : null}
        </View>
        <StatusPill {...orderState(order)} />
      </View>
    </Card>
  );
}

function OrderItems({ order }: { order: OrderDetailRow }) {
  const items = order.order_items ?? [];
  const lines: { label: string; value: number | null; strong?: boolean }[] = [
    { label: "Subtotal", value: order.subtotal },
    { label: "Discount", value: order.discount_amount ? -order.discount_amount : null },
    { label: "Service charge", value: order.service_charge || null },
    { label: "Tax", value: order.tax_amount },
    { label: "Tip", value: order.tip_amount || null },
    { label: "Total", value: order.total_amount, strong: true },
  ];
  return (
    <SectionBlock title="Items" Icon={Receipt}>
      {items.length === 0 ? (
        <Text className="px-5 py-4 text-sm text-gray-400">No items</Text>
      ) : (
        items.map((item) => {
          const name =
            (item.is_open_item && item.open_item_name) || item.item_name || "Item";
          const qty = item.quantity ?? 1;
          const lineTotal =
            item.subtotal ?? round2(new Decimal(item.unit_price ?? 0).times(qty));
          const mods = (item.order_item_modifiers ?? [])
            .map((m) =>
              m.is_no
                ? `No ${m.modifier_name}`
                : (m.quantity ?? 1) > 1
                  ? `${m.quantity}× ${m.modifier_name}`
                  : m.modifier_name,
            )
            .join(", ");
          const refundedQty = item.refunded_quantity ?? 0;
          const struck = item.is_voided ? "text-gray-400 line-through" : "text-gray-900";
          return (
            <View
              key={item.id}
              className="flex-row px-5 py-3.5 border-b border-gray-100"
            >
              <Text className="w-9 text-base font-semibold text-gray-500">
                {qty}×
              </Text>
              <View className="flex-1 pr-3">
                <Text className={`text-base font-semibold ${struck}`}>{name}</Text>
                {mods ? (
                  <Text className="text-sm text-gray-500 mt-0.5">{mods}</Text>
                ) : null}
                {item.is_voided ? (
                  <Text className="text-xs font-bold text-gray-400 mt-1">VOIDED</Text>
                ) : refundedQty > 0 ? (
                  <Text className="text-xs font-bold text-red-600 mt-1">
                    {refundedQty} REFUNDED
                  </Text>
                ) : null}
              </View>
              <Text className={`text-base font-semibold ${struck}`}>
                {kioskMoney(lineTotal)}
              </Text>
            </View>
          );
        })
      )}
      <View className="px-5 py-4 bg-gray-50" style={{ gap: 6 }}>
        {lines
          .filter((l) => l.value != null)
          .map((l) => (
            <View key={l.label} className="flex-row justify-between">
              <Text
                className={
                  l.strong ? "text-base font-bold text-gray-900" : "text-sm text-gray-500"
                }
              >
                {l.label}
              </Text>
              <Text
                className={
                  l.strong
                    ? "text-base font-bold text-gray-900"
                    : "text-sm font-semibold text-gray-700"
                }
              >
                {kioskMoney(l.value ?? 0)}
              </Text>
            </View>
          ))}
      </View>
    </SectionBlock>
  );
}

function OrderTransactions({ order }: { order: OrderDetailRow }) {
  const payments = order.order_payments ?? [];
  return (
    <SectionBlock title="Transactions" Icon={CreditCard}>
      {payments.length === 0 ? (
        <Text className="px-5 py-4 text-sm text-gray-400">
          No payments on this order.
        </Text>
      ) : (
        payments.map((p, i) => {
          const refunded = p.refunded_amount ?? 0;
          const ref = p.reference_number || p.transaction_id;
          const meta = [
            paymentStatusLabel(p),
            p.initiated_at ? timeLabel(p.initiated_at) : null,
            (p.tip_amount ?? 0) > 0 ? `Tip ${kioskMoney(p.tip_amount ?? 0)}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <View
              key={p.id}
              className={`px-5 py-4 ${
                i === payments.length - 1 ? "" : "border-b border-gray-100"
              }`}
            >
              <View className="flex-row items-center justify-between">
                <Text className="text-base font-semibold text-gray-900">
                  {paymentLabel(p)}
                </Text>
                <Text className="text-base font-bold text-gray-900">
                  {kioskMoney(p.amount ?? 0)}
                </Text>
              </View>
              <View className="flex-row items-center justify-between mt-1">
                <Text className="text-sm text-gray-500">{meta}</Text>
                {refunded > 0 ? (
                  <Text className="text-sm font-bold text-red-600">
                    Refunded {kioskMoney(refunded)}
                  </Text>
                ) : null}
              </View>
              {ref ? (
                <Text
                  className="text-xs text-gray-400 mt-1"
                  style={{ fontFamily: "monospace" }}
                  selectable
                  numberOfLines={1}
                >
                  Ref {ref}
                </Text>
              ) : null}
            </View>
          );
        })
      )}
    </SectionBlock>
  );
}

// ── Refund ───────────────────────────────────────────────────────────

type RefundSubmit = {
  type: "full" | "payments";
  totalAmount: number;
  reason: string;
  perPaymentDetails: ReturnType<typeof buildRefundDetails>;
};

const REFUND_MODES = [
  ["full", "Full refund"],
  ["custom", "Custom amount"],
] as const;

function RefundCard({
  order,
  staff,
  processing,
  onRefund,
}: {
  order: OrderDetailRow;
  staff: EmployeeProfile | null;
  processing: boolean;
  onRefund: (input: RefundSubmit) => Promise<boolean>;
}) {
  const { show: showDialog, dialog } = useKioskDialog();
  const [mode, setMode] = useState<"full" | "custom">("full");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const { refundable } = summarizePayments(order.order_payments);
  if (isVoidedOrder(order) || refundable <= 0) return null;

  const parsed = Number(amountText);
  const customValid =
    amountText !== "" &&
    Number.isFinite(parsed) &&
    parsed > 0 &&
    /^\d*(\.\d{0,2})?$/.test(amountText) &&
    parsed <= refundable;
  const amount = mode === "full" ? refundable : customValid ? round2(parsed) : 0;
  const canRefund = !!staff && !!reason && amount > 0 && !processing;

  const payments = order.order_payments ?? [];
  const collected = payments.filter(isCollected);
  const destination =
    collected.length === 1 ? paymentLabel(collected[0]) : "the original payments";
  // Not batched out yet: the card charge is cancelled whole, tip included.
  const cancelTotal = mode === "full" ? wholeChargeCancelTotal(payments) : null;

  const submit = () => {
    if (!canRefund || !reason) return;
    showDialog(
      `Refund ${kioskMoney(amount)}?`,
      `Order ${orderNumber(order)} · goes back to ${destination}. This can't be undone.` +
        (cancelTotal != null
          ? ` Not batched out yet, so the whole card charge of ${kioskMoney(cancelTotal)} is cancelled, tip included.`
          : ""),
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Refund",
          style: "destructive",
          onPress: async () => {
            if (submittingRef.current) return;
            submittingRef.current = true;
            try {
              const ok = await onRefund({
                type: mode === "full" ? "full" : "payments",
                totalAmount: amount,
                reason,
                perPaymentDetails: buildRefundDetails(payments, amount, mode === "full"),
              });
              if (ok) {
                setMode("full");
                setAmountText("");
                setReason(null);
              }
            } finally {
              submittingRef.current = false;
            }
          },
        },
      ],
    );
  };

  return (
    <SectionBlock title="Refund" Icon={Undo2} accent="#DC2626">
      <View className="px-5 py-5" style={{ gap: 18 }}>
        <View className="flex-row items-center justify-between">
          <Text className="text-base text-gray-500">Available to refund</Text>
          <Text className="text-xl font-bold text-gray-900">
            {kioskMoney(refundable)}
          </Text>
        </View>

        {/* Full / custom */}
        <View className="flex-row bg-gray-100 rounded-2xl p-1" style={{ gap: 4 }}>
          {REFUND_MODES.map(([value, label]) => {
            const active = mode === value;
            return (
              <TouchableOpacity
                key={value}
                onPress={() => setMode(value)}
                disabled={processing}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`flex-1 py-3 rounded-xl items-center ${
                  active ? "bg-teal-600" : ""
                }`}
              >
                <Text
                  className={`text-sm ${
                    active ? "font-bold text-white" : "font-semibold text-gray-600"
                  }`}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {mode === "custom" ? (
          <View>
            <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-2xl px-4">
              <Text className="text-xl font-bold text-gray-400">$</Text>
              <TextInput
                value={amountText}
                onChangeText={(t) => setAmountText(t.replace(/[^0-9.]/g, ""))}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                editable={!processing}
                className="flex-1 py-3.5 px-2 text-xl font-bold text-gray-900"
              />
            </View>
            <Text
              className={`text-xs mt-1.5 ${
                amountText && !customValid ? "text-red-600" : "text-gray-400"
              }`}
            >
              {amountText && !customValid
                ? `Enter an amount up to ${kioskMoney(refundable)}`
                : `Up to ${kioskMoney(refundable)}`}
            </Text>
          </View>
        ) : null}

        {/* Reason */}
        <View>
          <Text className="text-xs font-semibold text-gray-500 mb-2">Reason</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {REFUND_REASONS.map((r) => (
              <Chip
                key={r}
                label={r}
                active={reason === r}
                disabled={processing}
                onPress={() => setReason(reason === r ? null : r)}
              />
            ))}
          </View>
        </View>

        {!staff ? (
          <View className="flex-row items-center gap-2 rounded-2xl bg-amber-50 px-4 py-3">
            <AlertCircle size={18} color="#B45309" />
            <Text className="flex-1 text-sm text-amber-800">
              Open Kiosk Settings with a manager PIN to process refunds.
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={submit}
          disabled={!canRefund}
          activeOpacity={0.9}
          className={`py-4 rounded-2xl items-center flex-row justify-center ${
            canRefund || processing ? "bg-red-600" : "bg-gray-200"
          }`}
        >
          {processing ? (
            <>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text className="text-base font-bold text-white ml-2">
                Processing refund…
              </Text>
            </>
          ) : (
            <>
              <Undo2 size={18} color={canRefund ? "#FFFFFF" : "#9CA3AF"} />
              <Text
                className={`text-base font-bold ml-2 ${
                  canRefund ? "text-white" : "text-gray-400"
                }`}
              >
                {amount > 0 ? `Refund ${kioskMoney(amount)}` : "Refund"}
              </Text>
            </>
          )}
        </TouchableOpacity>
        {processing ? (
          <Text className="text-xs text-gray-400 text-center -mt-2">
            Keep this screen open until the refund finishes.
          </Text>
        ) : null}
      </View>
      {dialog}
    </SectionBlock>
  );
}
