import { colors } from "@/lib/theme";
import { useOrderStore } from "@/stores/useOrderStore";
import { Ban, type LucideIcon, Mail, MessageSquare, Printer } from "@/lib/icons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { checkTitle } from "../../lib/checks";
import { metrics, tint } from "../../lib/tokens";
import { type } from "../../lib/type";
import { ReceiptSheet } from "./ReceiptSheet";
import { sendReceipt, type ReceiptChannel } from "./unwired";

type Choice = ReceiptChannel | "none";

/** The artifact's `.rg`: a 92dp tile, accent icon over a 16/500 label. `muted` is `.rg.none`. */
function Tile({ icon: Icon, label, done, muted = false, onPress }: {
  icon: LucideIcon;
  label: string;
  done: boolean;
  muted?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: done }}
      className="flex-1 items-center justify-center"
      style={{
        minHeight: metrics.receiptCard,
        borderRadius: metrics.receiptRadius,
        backgroundColor: done ? tint.accentSoft : colors.panel,
        gap: 10,
      }}
    >
      <Icon size={26} color={muted && !done ? colors.muted : colors.teal} />
      <Text style={[type.line, { color: muted && !done ? colors.label : colors.heading }]}>{label}</Text>
    </Pressable>
  );
}

/**
 * Screen 9's `.lbl` + `.rgrid`: "Send a receipt" over Text, Email, Print and
 * No receipt. Text and email ask for an address first; print goes to the
 * device's built-in printer when wired. A tile lights once its receipt went.
 */
export function ReceiptOptions({ orderId }: { orderId: string }) {
  const order = useOrderStore((s) => s.ordersById[orderId] ?? null);
  const [done, setDone] = useState<Choice | null>(null);
  const [asking, setAsking] = useState<"text" | "email" | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (channel: ReceiptChannel, to?: string) => {
    setBusy(true);
    const ok = await sendReceipt(orderId, channel, to);
    setBusy(false);
    if (!ok) return;
    setDone(channel);
    setAsking(null);
  };

  return (
    <View>
      <Text className="text-center" style={[type.lbl, { color: colors.label, paddingHorizontal: 20, paddingBottom: 12 }]}>
        Send a receipt
      </Text>
      <View style={{ paddingHorizontal: metrics.px, gap: 10 }}>
        <View className="flex-row" style={{ gap: 10 }}>
          <Tile icon={MessageSquare} label="Text" done={done === "text"} onPress={() => setAsking("text")} />
          <Tile icon={Mail} label="Email" done={done === "email"} onPress={() => setAsking("email")} />
        </View>
        <View className="flex-row" style={{ gap: 10 }}>
          <Tile icon={Printer} label="Print" done={done === "print"} onPress={() => void send("print")} />
          <Tile icon={Ban} label="No receipt" muted done={done === "none"} onPress={() => setDone("none")} />
        </View>
      </View>
      {asking ? (
        <ReceiptSheet
          channel={asking}
          initial={(asking === "text" ? order?.customer_phone : order?.customer_email) ?? ""}
          subtitle={order ? checkTitle(order) : ""}
          busy={busy}
          onSend={(to) => void send(asking, to)}
          onClose={() => setAsking(null)}
        />
      ) : null}
    </View>
  );
}
