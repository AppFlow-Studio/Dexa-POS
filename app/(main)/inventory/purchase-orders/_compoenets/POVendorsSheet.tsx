import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

type POVendorsSheetProps = {
  onUseTemplate: (poId: string) => void;
  onSelectVendor?: (vendorId: string) => void;
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
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 3),
    [purchaseOrders, vendorId]
  );

  const formatAmount = (poId: string) => {
    const po = purchaseOrders.find((p) => p.id === poId);
    if (!po) return "$0.00";
    const sum = po.items.reduce((acc, li) => acc + li.quantity * li.cost, 0);
    return `$${sum.toFixed(2)}`;
  };

  const getItemName = (inventoryItemId: string) => {
    const item = inventoryItems.find((i) => i.id === inventoryItemId);
    return item?.name || "Item";
  };

  if (!vendor) return null;
  return (
    <View className="border-b border-gray-700 py-3">
      <View className="flex-row items-center justify-between">
        <View className="flex-1 pr-2">
          <Text className="text-white text-base font-semibold">
            {vendor.name}{" "}
          </Text>
          {!!vendor.description && (
            <Text className="text-gray-400 text-xs mt-0.5">
              {vendor.description}
            </Text>
          )}
        </View>
        {onSelectVendor && (
          <TouchableOpacity
            onPress={() => onSelectVendor(vendorId)}
            className="px-2 py-1 h-10 flex-row items-center justify-center rounded-lg bg-blue-500"
          >
            <Text className="text-white text-[10px] font-bold">Select</Text>
          </TouchableOpacity>
        )}
      </View>
      <View className="mt-2 bg-[#212121] border border-gray-700 rounded-xl p-2">
        <Text className="text-white font-semibold mb-1.5 text-sm">
          Recent POs
        </Text>
        {vendorPOs.length === 0 ? (
          <Text className="text-gray-400 text-sm">No recent POs</Text>
        ) : (
          vendorPOs.map((po) => {
            const preview = po.items.slice(0, 6);
            const remaining = Math.max(po.items.length - preview.length, 0);
            return (
              <View
                key={po.id}
                className="py-2 border-t border-gray-800 first:border-t-0"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-white font-medium text-sm">
                      {po.poNumber}
                    </Text>
                    <Text className="text-gray-500 text-[10px]">
                      {new Date(po.createdAt).toLocaleDateString()} •{" "}
                      {po.status}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-white font-semibold text-sm">
                      {formatAmount(po.id)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => onUseTemplate(po.id)}
                      className="px-2 py-1 h-10 flex-row items-center justify-center rounded-lg bg-blue-500"
                    >
                      <Text className="text-white text-[10px] font-bold">
                        Use
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="mt-1.5 flex-row flex-wrap gap-1.5">
                  {preview.map((li, idx) => (
                    <View
                      key={`${po.id}_${idx}`}
                      className="px-1.5 py-0.5 rounded-full bg-[#2a2a2a] border border-gray-700"
                    >
                      <Text className="text-[10px] text-gray-200">
                        {getItemName(li.inventoryItemId)} x{li.quantity}
                      </Text>
                    </View>
                  ))}
                  {remaining > 0 && (
                    <View className="px-1.5 py-0.5 rounded-full bg-[#2a2a2a] border border-gray-700">
                      <Text className="text-[10px] text-gray-300">
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
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
          />
        )}
        backgroundStyle={{ backgroundColor: "#303030" }}
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      >
        <View className="px-3 pb-1.5">
          <Text className="text-white text-base font-bold mb-1.5">
            Select Vendor
          </Text>
          <View className="bg-[#212121] border border-gray-700 rounded-xl px-2 py-1.5">
            <TextInput
              placeholder="Search vendors..."
              placeholderTextColor="#9CA3AF"
              value={query}
              onChangeText={setQuery}
              className="text-white h-16 text-base"
            />
          </View>
        </View>
        <BottomSheetFlatList
          data={filteredVendors}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <VendorRow
              vendorId={item.id}
              onUseTemplate={onUseTemplate}
              onSelectVendor={onSelectVendor}
            />
          )}
        />
      </BottomSheet>
    );
  }
);

POVendorsSheet.displayName = "POVendorsSheet";

export default POVendorsSheet;
