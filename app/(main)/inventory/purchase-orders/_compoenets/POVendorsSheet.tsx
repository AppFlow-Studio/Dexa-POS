import { bottomSheetTheme, colors } from "@/lib/theme";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Building2, Search } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type POVendorsSheetProps = {
  onUseTemplate: (poId: string) => void;
  onSelectVendor?: (vendorId: string) => void;
};

const statusStyle = (status: string) => {
  switch (status) {
    case "Awaiting Payment": return { bg: colors.success + "20", text: colors.success };
    case "Pending Delivery": return { bg: colors.info + "20", text: colors.info };
    case "Draft": return { bg: colors.muted + "15", text: colors.muted };
    case "Paid": return { bg: colors.teal + "20", text: colors.teal };
    case "Cancelled": return { bg: colors.danger + "20", text: colors.danger };
    default: return { bg: colors.warning + "20", text: colors.warning };
  }
};

const VendorRow = ({
  vendorId,
  onUseTemplate,
  onSelectVendor,
}: {
  vendorId: string;
  onUseTemplate: (poId: string) => void;
  onSelectVendor?: (vendorId: string) => void;
}) => {
  const { vendors, purchaseOrders, inventoryItems } = useInventoryStore();
  const vendor = vendors.find((v) => v.id === vendorId);
  const vendorPOs = useMemo(
    () =>
      purchaseOrders
        .filter((po) => po.vendorId === vendorId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 3),
    [purchaseOrders, vendorId]
  );

  const getItemName = (inventoryItemId: string) =>
    inventoryItems.find((i) => i.id === inventoryItemId)?.name || "Item";

  const formatAmount = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return "$0.00";
    return `$${po.items.reduce((a, li) => a + li.quantity * li.cost, 0).toFixed(2)}`;
  };

  if (!vendor) return null;

  return (
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12 }}>
      {/* Vendor header */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <View style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "30", alignItems: "center", justifyContent: "center" }}>
            <Building2 size={13} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>{vendor.name}</Text>
            {!!vendor.description && (
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }} numberOfLines={1}>{vendor.description}</Text>
            )}
          </View>
        </View>
        {onSelectVendor && (
          <TouchableOpacity
            onPress={() => onSelectVendor(vendorId)}
            style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 7 }}
          >
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Select</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recent POs */}
      <View style={{ backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          Recent POs
        </Text>
        {vendorPOs.length === 0 ? (
          <Text style={{ fontSize: 12, color: colors.muted }}>No recent POs</Text>
        ) : (
          vendorPOs.map((po, idx) => {
            const preview = po.items.slice(0, 5);
            const remaining = Math.max(po.items.length - preview.length, 0);
            const s = statusStyle(po.status);
            return (
              <View key={po.id} style={{ paddingTop: idx === 0 ? 0 : 8, marginTop: idx === 0 ? 0 : 8, borderTopWidth: idx === 0 ? 0 : 1, borderTopColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>{po.poNumber}</Text>
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, backgroundColor: s.bg, borderRadius: 4 }}>
                        <Text style={{ fontSize: 10, fontWeight: "600", color: s.text }}>{po.status}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      {new Date(po.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: colors.heading }}>{formatAmount(po.id)}</Text>
                    <TouchableOpacity
                      onPress={() => onUseTemplate(po.id)}
                      style={{ paddingHorizontal: 8, paddingVertical: 5, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50", borderRadius: 6 }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>Use</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                  {preview.map((li, i) => (
                    <View key={`${po.id}_${i}`} style={{ paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, color: colors.label }}>
                        {getItemName(li.inventoryItemId)} ×{li.quantity}
                      </Text>
                    </View>
                  ))}
                  {remaining > 0 && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 20 }}>
                      <Text style={{ fontSize: 10, color: colors.muted }}>+{remaining} more</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </View>
    </View>
  );
};

const POVendorsSheet = forwardRef<BottomSheet, POVendorsSheetProps>(
  ({ onUseTemplate, onSelectVendor }, ref) => {
    const { vendors } = useInventoryStore();
    const [query, setQuery] = useState("");
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const filteredVendors = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return vendors;
      return vendors.filter((v) =>
        [v.name, v.contactPerson, v.email, v.phone, v.description]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q))
      );
    }, [vendors, query]);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
        )}
        {...bottomSheetTheme}
      >
        {/* Header */}
        <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading, marginBottom: 8 }}>Select Vendor</Text>
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38, gap: 8 }}>
            <Search size={14} color={colors.muted} />
            <BottomSheetTextInput
              placeholder="Search vendors..."
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 0, height: 38 }}
            />
          </View>
        </View>

        <BottomSheetFlatList
          data={filteredVendors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
          renderItem={({ item }) => (
            <VendorRow
              vendorId={item.id}
              onUseTemplate={onUseTemplate}
              onSelectVendor={onSelectVendor}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>No vendors found</Text>
            </View>
          }
        />
      </BottomSheet>
    );
  }
);

POVendorsSheet.displayName = "POVendorsSheet";

export default POVendorsSheet;
