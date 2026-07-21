import { bottomSheetTheme, colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { Building2, Search } from "lucide-react-native";
import { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

type POVendorsSheetProps = {
  onUseTemplate: (poId: string) => void;
  onSelectVendor?: (vendorId: string) => void;
};

const statusStyle = (status: string) => {
  switch (status) {
    case "Awaiting Payment":
      return { bg: colors.success + "20", text: colors.success };
    case "Pending Delivery":
      return { bg: colors.info + "20", text: colors.info };
    case "Draft":
      return { bg: colors.muted + "15", text: colors.muted };
    case "Paid":
      return { bg: colors.teal + "20", text: colors.teal };
    case "Cancelled":
      return { bg: colors.danger + "20", text: colors.danger };
    default:
      return { bg: colors.warning + "20", text: colors.warning };
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
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const vendor = vendors.find((v) => v.id === vendorId);
  const vendorPOs = useMemo(
    () =>
      purchaseOrders
        .filter((po) => po.vendorId === vendorId)
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, 3),
    [purchaseOrders, vendorId],
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
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: s(12),
      }}
    >
      {/* Vendor header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: s(8),
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(8),
            flex: 1,
          }}
        >
          <View
            style={{
              width: s(28),
              height: s(28),
              borderRadius: s(7),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "30",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Building2 size={s(13)} color={colors.teal} />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: "600",
                color: colors.heading,
              }}
            >
              {vendor.name}
            </Text>
            {!!vendor.description && (
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  marginTop: s(1),
                }}
                numberOfLines={1}
              >
                {vendor.description}
              </Text>
            )}
          </View>
        </View>
        {onSelectVendor && (
          <TouchableOpacity
            onPress={() => onSelectVendor(vendorId)}
            style={{
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              borderRadius: s(7),
            }}
          >
            <Text
              style={{ fontSize: s(11), fontWeight: "600", color: colors.teal }}
            >
              Select
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recent POs */}
      <View
        style={{
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(8),
          padding: s(10),
        }}
      >
        <Text
          style={{
            fontSize: s(11),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: s(8),
          }}
        >
          Recent POs
        </Text>
        {vendorPOs.length === 0 ? (
          <Text style={{ fontSize: s(12), color: colors.muted }}>
            No recent POs
          </Text>
        ) : (
          vendorPOs.map((po, idx) => {
            const preview = po.items.slice(0, 5);
            const remaining = Math.max(po.items.length - preview.length, 0);
            const st = statusStyle(po.status);
            return (
              <View
                key={po.id}
                style={{
                  paddingTop: idx === 0 ? 0 : s(8),
                  marginTop: idx === 0 ? 0 : s(8),
                  borderTopWidth: idx === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: s(5),
                  }}
                >
                  <View style={{ flex: 1, paddingRight: s(8) }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(6),
                        marginBottom: s(2),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(12),
                          fontWeight: "600",
                          color: colors.heading,
                        }}
                      >
                        {po.poNumber}
                      </Text>
                      <View
                        style={{
                          paddingHorizontal: s(6),
                          paddingVertical: s(2),
                          backgroundColor: st.bg,
                          borderRadius: s(4),
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(10),
                            fontWeight: "600",
                            color: st.text,
                          }}
                        >
                          {po.status}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: s(11), color: colors.muted }}>
                      {new Date(po.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(8),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "700",
                        color: colors.heading,
                      }}
                    >
                      {formatAmount(po.id)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => onUseTemplate(po.id)}
                      style={{
                        paddingHorizontal: s(8),
                        paddingVertical: s(5),
                        backgroundColor: colors.teal + "20",
                        borderWidth: 1,
                        borderColor: colors.teal + "50",
                        borderRadius: s(6),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(11),
                          fontWeight: "600",
                          color: colors.teal,
                        }}
                      >
                        Use
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: s(4) }}
                >
                  {preview.map((li, i) => (
                    <View
                      key={`${po.id}_${i}`}
                      style={{
                        paddingHorizontal: s(7),
                        paddingVertical: s(2),
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{ fontSize: s(10), color: colors.label }}>
                        {getItemName(li.inventoryItemId)} ×{li.quantity}
                      </Text>
                    </View>
                  ))}
                  {remaining > 0 && (
                    <View
                      style={{
                        paddingHorizontal: s(7),
                        paddingVertical: s(2),
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{ fontSize: s(10), color: colors.muted }}>
                        +{remaining} more
                      </Text>
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
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);
    const { vendors } = useInventoryStore();
    const [query, setQuery] = useState("");
    const snapPoints = useMemo(() => ["50%", "90%"], []);

    const filteredVendors = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return vendors;
      return vendors.filter((v) =>
        [v.name, v.email, v.phone, v.description]
          .filter(Boolean)
          .some((s) => String(s).toLowerCase().includes(q)),
      );
    }, [vendors, query]);

    const groupedVendors = useMemo(() => {
      const map: Record<string, typeof filteredVendors> = {};
      for (const v of filteredVendors) {
        const first = (v.name || "?")[0].toUpperCase();
        const key = /[A-Z]/.test(first) ? first : "#";
        if (!map[key]) map[key] = [];
        map[key].push(v);
      }
      const letters = Object.keys(map).sort((a, b) => {
        if (a === "#") return 1;
        if (b === "#") return -1;
        return a.localeCompare(b);
      });
      return letters.map((letter) => ({ title: letter, data: map[letter] }));
    }, [filteredVendors]);

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
        {...bottomSheetTheme}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "700",
              color: colors.heading,
              marginBottom: 8,
            }}
          >
            Select Vendor
          </Text>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 8,
              paddingHorizontal: 10,
              height: 38,
              gap: 8,
            }}
          >
            <Search size={14} color={colors.muted} />
            <BottomSheetTextInput
              placeholder="Search vendors..."
              placeholderTextColor={colors.muted}
              value={query}
              onChangeText={setQuery}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.heading,
                paddingVertical: 0,
                height: 38,
              }}
            />
          </View>
        </View>

        <BottomSheetSectionList
          sections={groupedVendors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 30 }}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingVertical: 4,
                paddingHorizontal: 4,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginBottom: 4,
                marginTop: 8,
              }}
            >
              <Text
                style={{
                  color: colors.teal,
                  fontSize: 11,
                  fontWeight: "700",
                  letterSpacing: 1,
                }}
              >
                {section.title}
              </Text>
            </View>
          )}
          renderItem={({ item }) => (
            <VendorRow
              vendorId={item.id}
              onUseTemplate={onUseTemplate}
              onSelectVendor={onSelectVendor}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                No vendors found
              </Text>
            </View>
          }
        />
      </BottomSheet>
    );
  },
);

POVendorsSheet.displayName = "POVendorsSheet";

export default POVendorsSheet;
