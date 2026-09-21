import { colors } from "@/lib/theme";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useHandheldTab } from "../lib/tabStore";
import { type } from "../lib/type";
import { PageHeader, StickyActionBar } from "../primitives";
import { CustomerField } from "../screens/neworder/CustomerField";
import { OrderTypeTiles, type TileType } from "../screens/neworder/OrderTypeTiles";
import { useStartOrder } from "../screens/neworder/useStartOrder";

function Label({ text, top = false }: { text: string; top?: boolean }) {
  return (
    <Text className="px-5" style={[type.segment, { paddingBottom: 10, paddingTop: top ? 28 : 0, color: colors.label }]}>
      {text}
    </Text>
  );
}

/**
 * S2: type first, then who it's for. Takeout and delivery want a name and
 * number; dine in asks for a table instead, so it pops back onto the Tables
 * tab. Route: /handheld/order/new.
 */
export default function NewOrderPage() {
  const router = useRouter();
  const setTab = useHandheldTab((s) => s.setTab);
  const { start, busy } = useStartOrder();
  const [kind, setKind] = useState<TileType>("takeout");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const dineIn = kind === "dine_in";
  const label = dineIn ? "Choose a table" : kind === "takeout" ? "Start takeout order" : "Start delivery order";

  const submit = async () => {
    if (dineIn) {
      setTab("tables");
      router.back();
      return;
    }
    const id = await start(kind, { name, phone });
    if (id) router.replace({ pathname: "/handheld/order/[id]", params: { id } });
  };

  return (
    <View className="flex-1" style={{ backgroundColor: colors.screen }}>
      <PageHeader title="New order" onBack={() => router.back()} />
      <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
        <Label text="Order type" />
        <OrderTypeTiles value={kind} onChange={setKind} />
        {dineIn ? (
          <Text className="px-5" style={[type.sheetDesc, { paddingTop: 28, color: colors.label }]}>
            Dine-in checks start from a table. Pick one on the Tables tab and seat it.
          </Text>
        ) : (
          <>
            <Label text="Customer" top />
            <View className="gap-2.5">
              <CustomerField label="Name" value={name} onChange={setName} placeholder="Who is it for?" />
              <CustomerField
                label="Phone — for the ready text"
                value={phone}
                onChange={setPhone}
                placeholder="Add a number"
                keyboardType="phone-pad"
              />
            </View>
          </>
        )}
      </ScrollView>
      <StickyActionBar column actions={[{ label, onPress: () => void submit(), disabled: busy }]} />
    </View>
  );
}
