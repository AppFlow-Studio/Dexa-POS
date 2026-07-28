import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { POLineItem } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView
} from "@/components/ui/bottomSheet";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import POVendorsSheet from "./_compoenets/POVendorsSheet";

const makeFieldLabel = (s: (n: number) => number) => ({
  fontSize: s(11),
  fontWeight: "600" as const,
  color: colors.muted,
  textTransform: "uppercase" as const,
  letterSpacing: 0.5,
  marginBottom: s(5),
});

const makeInputStyle = (s: (n: number) => number) => ({
  backgroundColor: colors.screen,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: s(8),
  color: colors.heading,
  fontSize: s(13),
  height: s(38),
  paddingHorizontal: s(12),
});

const CreatePurchaseOrderScreen = () => {
  const router = useRouter();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const fieldLabel = useMemo(() => makeFieldLabel(s), [uiScale]);
  const inputStyle = useMemo(() => makeInputStyle(s), [uiScale]);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const {
    vendors,
    inventoryItems,
    createPurchaseOrder,
    purchaseOrders,
    addInventoryItem,
  } = useInventoryStore();
  const { activeEmployeeId, employees } = useEmployeeStore();

  const [selectedVendorId, setSelectedVendorId] = useState<
    string | undefined
  >();
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(
    activeEmployeeId,
  );
  const [lineItems, setLineItems] = useState<POLineItem[]>([]);
  const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<
    string | null
  >(null);
  const [selectedQuantity, setSelectedQuantity] = useState("1");
  const [itemSearch, setItemSearch] = useState("");
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemUnit, setNewItemUnit] = useState("pcs");
  const [newItemCost, setNewItemCost] = useState("");
  const [newItemStock, setNewItemStock] = useState("");
  const [newItemReorder, setNewItemReorder] = useState("");
  const [newItemPOQty, setNewItemPOQty] = useState("1");

  const vendorsSheetRef = useRef<BottomSheet>(null);
  const itemsSheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    if (activeEmployeeId && !selectedEmployeeId)
      setSelectedEmployeeId(activeEmployeeId);
  }, [activeEmployeeId]);

  const selectedVendor = vendors.find((v) => v.id === selectedVendorId);

  const vendorItems = useMemo(() => {
    if (!selectedVendorId) return [] as typeof inventoryItems;
    return inventoryItems.filter((i) => i.vendorId === selectedVendorId);
  }, [inventoryItems, selectedVendorId]);

  const filteredVendorItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    if (!q) return vendorItems;
    return vendorItems.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.unit ?? "").toString().toLowerCase().includes(q),
    );
  }, [vendorItems, itemSearch]);

  const totalCost = lineItems.reduce((a, li) => a + li.cost * li.quantity, 0);

  const addSelectedItemToPO = () => {
    if (!selectedInventoryItemId) return;
    const qty = Math.max(1, Number(selectedQuantity || 1));
    const inv = inventoryItems.find((i) => i.id === selectedInventoryItemId);
    if (!inv) return;
    if (lineItems.some((li) => li.inventoryItemId === inv.id)) {
      alert("This item is already in the purchase order.");
      return;
    }
    setLineItems((prev) => [
      ...prev,
      { inventoryItemId: inv.id, quantity: qty, cost: inv.cost },
    ]);
    setSelectedInventoryItemId(null);
    setSelectedQuantity("1");
    itemsSheetRef.current?.close();
  };

  const handleCreateNewItem = () => {
    if (!selectedVendorId) {
      alert("Please select a vendor first");
      return;
    }
    if (!newItemName.trim()) {
      alert("Please enter item name");
      return;
    }
    addInventoryItem(
      {
        name: newItemName.trim(),
        category: "Uncategorized",
        stockQuantity: Math.max(0, Number(newItemStock || 0)),
        unit: newItemUnit as any,
        unitType: "unit",
        reorderThreshold: Math.max(0, Number(newItemReorder || 0)),
        cost: Number(newItemCost || 0),
        vendorId: selectedVendorId,
        locationId: selectedStore?.id ?? "",
        stockTrackingMode: "quantity",
      },
      selectedStore?.id ?? "",
    );
    const created = useInventoryStore.getState().inventoryItems[0];
    if (created && created.vendorId === selectedVendorId) {
      setLineItems((prev) => [
        ...prev,
        {
          inventoryItemId: created.id,
          quantity: Math.max(1, Number(newItemPOQty || 1)),
          cost: created.cost,
        },
      ]);
    }
    setNewItemName("");
    setNewItemUnit("pcs");
    setNewItemCost("");
    setNewItemStock("");
    setNewItemReorder("");
    setNewItemPOQty("1");
    setNewItemModalOpen(false);
    itemsSheetRef.current?.close();
  };

  const handleQuantityChange = (itemId: string, text: string) => {
    const n = parseInt(text, 10);
    setLineItems((prev) =>
      prev.map((li) =>
        li.inventoryItemId === itemId
          ? { ...li, quantity: isNaN(n) ? 0 : n }
          : li,
      ),
    );
  };

  const handleSave = async () => {
    if (!selectedVendorId || lineItems.length === 0) {
      alert("Please select a vendor and add at least one item.");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    try {
      await createPurchaseOrder({
        vendorId: selectedVendorId,
        status: "Draft",
        items: lineItems,
        createdByEmployeeId: selectedEmployeeId || undefined,
        createdByEmployeeName: emp?.fullName,
      });
      router.back();
    } catch {
      alert("Failed to save draft purchase order.");
    }
  };

  const handleSubmit = async () => {
    if (!selectedVendorId || lineItems.length === 0) {
      alert("Please select a vendor and add at least one item.");
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmployeeId);
    try {
      await createPurchaseOrder({
        vendorId: selectedVendorId,
        status: "Pending Delivery",
        items: lineItems,
        createdByEmployeeId: selectedEmployeeId || undefined,
        createdByEmployeeName: emp?.fullName,
      });
      router.back();
    } catch {
      alert("Failed to submit purchase order.");
    }
  };

  const renderHeader = () => (
    <>
      {/* Page Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: s(14),
        }}
      >
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(5),
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "30",
              borderRadius: s(7),
            }}
          >
            <ArrowLeft size={s(13)} color={colors.teal} />
            <Text
              style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
            >
              Back
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: s(15),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Create Purchase Order
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: s(8) }}>
          <TouchableOpacity
            onPress={handleSave}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(7),
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(8),
            }}
          >
            <Text
              style={{
                fontSize: s(12),
                fontWeight: "600",
                color: colors.label,
              }}
            >
              Save Draft
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSubmit}
            style={{
              paddingHorizontal: s(12),
              paddingVertical: s(7),
              backgroundColor: colors.teal + "20",
              borderWidth: 1,
              borderColor: colors.teal + "50",
              borderRadius: s(8),
            }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: "600", color: colors.teal }}
            >
              Submit PO
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* PO Info Card */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(12),
          padding: s(14),
          marginBottom: s(12),
        }}
      >
        <View style={{ flexDirection: "row", gap: s(12) }}>
          {/* Vendor */}
          <View style={{ flex: 1 }}>
            <Text style={fieldLabel}>Vendor</Text>
            <TouchableOpacity
              onPress={() => vendorsSheetRef.current?.expand()}
              style={{
                height: s(38),
                borderWidth: 1,
                borderColor: selectedVendorId
                  ? colors.teal + "50"
                  : colors.border,
                borderRadius: s(8),
                paddingHorizontal: s(12),
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: selectedVendorId
                  ? colors.teal + "10"
                  : "transparent",
                borderStyle: selectedVendorId ? "solid" : "dashed",
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  color: selectedVendorId ? colors.heading : colors.muted,
                }}
              >
                {selectedVendor?.name || "Select a vendor..."}
              </Text>
              <ChevronDown size={s(14)} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Employee */}
          <View style={{ flex: 1 }}>
            <Text style={fieldLabel}>Assigned Employee</Text>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <TouchableOpacity
                  style={{
                    height: s(38),
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    paddingHorizontal: s(12),
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(6),
                    }}
                  >
                    <User size={s(13)} color={colors.muted} />
                    <Text
                      style={{
                        fontSize: s(13),
                        color: selectedEmployeeId
                          ? colors.heading
                          : colors.muted,
                      }}
                    >
                      {selectedEmployeeId
                        ? employees.find((e) => e.id === selectedEmployeeId)
                            ?.fullName
                        : "Select..."}
                    </Text>
                  </View>
                  <ChevronDown size={s(14)} color={colors.muted} />
                </TouchableOpacity>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64"
                style={{
                  backgroundColor: colors.panel,
                  borderColor: colors.border,
                }}
              >
                {employees.map((emp) => (
                  <DropdownMenuItem
                    key={emp.id}
                    onPress={() => setSelectedEmployeeId(emp.id)}
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
                          width: s(26),
                          height: s(26),
                          borderRadius: s(13),
                          backgroundColor: colors.teal + "20",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: s(10),
                            fontWeight: "700",
                            color: colors.teal,
                          }}
                        >
                          {emp.fullName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .toUpperCase()
                            .slice(0, 2)}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{ fontSize: s(13), color: colors.heading }}
                        >
                          {emp.fullName}
                        </Text>
                        <Text style={{ fontSize: s(11), color: colors.muted }}>
                          {emp.shiftStatus === "clocked_in"
                            ? "Clocked In"
                            : "Clocked Out"}
                        </Text>
                      </View>
                      {selectedEmployeeId === emp.id && (
                        <View
                          style={{
                            width: s(6),
                            height: s(6),
                            borderRadius: s(3),
                            backgroundColor: colors.teal,
                          }}
                        />
                      )}
                    </View>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </View>
        </View>
      </View>

      {/* Items section header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: colors.border,
          borderTopLeftRadius: s(12),
          borderTopRightRadius: s(12),
          paddingHorizontal: s(12),
          paddingVertical: s(8),
        }}
      >
        <Text
          style={{
            fontSize: s(11),
            fontWeight: "600",
            color: colors.muted,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          Line Items ({lineItems.length})
        </Text>
        {lineItems.length > 0 && (
          <Text
            style={{
              fontSize: s(12),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Total: ${totalCost.toFixed(2)}
          </Text>
        )}
      </View>
    </>
  );

  const renderFooter = () => (
    <View
      style={{
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: colors.border,
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        overflow: "hidden",
      }}
    >
      <TouchableOpacity
        disabled={!selectedVendorId}
        onPress={() => itemsSheetRef.current?.expand()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 10,
          borderStyle: "dashed",
          borderWidth: 1,
          borderColor: selectedVendorId ? colors.teal + "40" : colors.border,
          margin: 10,
          borderRadius: 8,
          opacity: selectedVendorId ? 1 : 0.5,
        }}
      >
        <Plus size={13} color={selectedVendorId ? colors.teal : colors.muted} />
        <Text
          style={{
            fontSize: 13,
            fontWeight: "600",
            color: selectedVendorId ? colors.teal : colors.muted,
          }}
        >
          Add Item
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <FlatList
          data={lineItems}
          keyExtractor={(item, index) => `${item.inventoryItemId}-${index}`}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          contentContainerStyle={{ padding: 14, paddingBottom: 60 }}
          renderItem={({ item }) => {
            const inv = inventoryItems.find(
              (i) => i.id === item.inventoryItemId,
            );
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  borderLeftWidth: 1,
                  borderRightWidth: 1,
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel,
                }}
              >
                <Text
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  {inv?.name || "Unknown"}
                </Text>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <TextInput
                    value={item.quantity.toString()}
                    onChangeText={(t) =>
                      handleQuantityChange(item.inventoryItemId, t)
                    }
                    keyboardType="number-pad"
                    style={{
                      width: 52,
                      height: 28,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 6,
                      color: colors.heading,
                      fontSize: 13,
                      lineHeight: 16,
                      textAlign: "center",
                      textAlignVertical: "center",
                      includeFontPadding: false,
                      paddingVertical: 0,
                    }}
                  />
                  <Text
                    style={{ fontSize: 12, color: colors.muted, width: 36 }}
                  >
                    {inv?.unit}
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "600",
                      color: colors.heading,
                      width: 70,
                      textAlign: "right",
                    }}
                  >
                    ${(item.cost * item.quantity).toFixed(2)}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setLineItems((prev) =>
                        prev.filter(
                          (li) => li.inventoryItemId !== item.inventoryItemId,
                        ),
                      )
                    }
                    style={{ padding: 5 }}
                  >
                    <Trash2 size={14} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View
              style={{
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                alignItems: "center",
                paddingVertical: 24,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.muted }}>
                No items added yet
              </Text>
            </View>
          }
        />
      </KeyboardAvoidingView>

      {/* Item Selection Sheet */}
      <BottomSheet
        ref={itemsSheetRef}
        index={-1}
        snapPoints={["50%", "95%"]}
        {...bottomSheetTheme}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            appearsOnIndex={0}
            disappearsOnIndex={-1}
            opacity={0.7}
          />
        )}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
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
                }}
              >
                Select Item
              </Text>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    height: 36,
                    gap: 6,
                  }}
                >
                  <Search size={13} color={colors.muted} />
                  <TextInput
                    value={itemSearch}
                    onChangeText={setItemSearch}
                    placeholder="Search..."
                    placeholderTextColor={colors.muted}
                    style={{
                      fontSize: 13,
                      color: colors.heading,
                      width: 120,
                      paddingVertical: 0,
                    }}
                  />
                </View>
                <TouchableOpacity
                  onPress={() => setNewItemModalOpen(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 10,
                    paddingVertical: 7,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: 8,
                  }}
                >
                  <Plus size={13} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    New Item
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Qty input for selected item */}
            {selectedInventoryItemId &&
              (() => {
                const sel = vendorItems.find(
                  (i) => i.id === selectedInventoryItemId,
                );
                return (
                  <View
                    style={{
                      marginHorizontal: 12,
                      marginTop: 10,
                      marginBottom: 4,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.teal + "40",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.heading,
                        marginBottom: 8,
                      }}
                    >
                      Qty — {sel?.name} ({sel?.unit})
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TextInput
                        keyboardType="number-pad"
                        value={selectedQuantity}
                        onChangeText={setSelectedQuantity}
                        placeholder="Quantity"
                        placeholderTextColor={colors.muted}
                        style={{
                          flex: 1,
                          height: 38,
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 8,
                          color: colors.heading,
                          fontSize: 13,
                          paddingHorizontal: 12,
                          paddingVertical: 0,
                        }}
                      />
                      <TouchableOpacity
                        onPress={addSelectedItemToPO}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 9,
                          backgroundColor: colors.teal + "20",
                          borderWidth: 1,
                          borderColor: colors.teal + "50",
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "600",
                            color: colors.teal,
                          }}
                        >
                          Add to PO
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

            <View style={{ flex: 1, paddingHorizontal: 0 }}>
              {!selectedVendorId ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    Select a vendor first.
                  </Text>
                </View>
              ) : vendorItems.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 40 }}>
                  <Text style={{ fontSize: 13, color: colors.muted }}>
                    No items for this vendor.
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredVendorItems}
                  keyExtractor={(i, idx) => `${i.id}-${idx}`}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  renderItem={({ item: inv }) => {
                    const isSelected = selectedInventoryItemId === inv.id;
                    return (
                      <TouchableOpacity
                        onPress={() => setSelectedInventoryItemId(inv.id)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          backgroundColor: isSelected
                            ? colors.teal + "10"
                            : "transparent",
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: isSelected ? colors.teal : colors.heading,
                            }}
                          >
                            {inv.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 1,
                            }}
                          >
                            {inv.unit} | ${inv.cost.toFixed(2)} | Stock:{" "}
                            {inv.stockQuantity}
                          </Text>
                        </View>
                        {isSelected && (
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingVertical: 3,
                              backgroundColor: colors.teal + "20",
                              borderWidth: 1,
                              borderColor: colors.teal + "40",
                              borderRadius: 5,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 11,
                                fontWeight: "600",
                                color: colors.teal,
                              }}
                            >
                              Selected
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View style={{ alignItems: "center", paddingVertical: 32 }}>
                      <Text style={{ fontSize: 13, color: colors.muted }}>
                        No items match.
                      </Text>
                    </View>
                  }
                />
              )}
            </View>
          </KeyboardAvoidingView>
        </BottomSheetView>
      </BottomSheet>

      {/* New Item Modal */}
      <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
        <DialogContent>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              bounces={false}
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 14,
                width: 500,
              }}
              contentContainerStyle={{ padding: 18 }}
            >
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: "700",
                  color: colors.heading,
                  marginBottom: 14,
                }}
              >
                Add Inventory Item
              </Text>
              <View style={{ gap: 10 }}>
                <View>
                  <Text style={fieldLabel}>Vendor</Text>
                  <View
                    style={{
                      height: 38,
                      backgroundColor: colors.screen,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 12,
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontSize: 13, color: colors.heading }}>
                      {vendors.find((v) => v.id === selectedVendorId)?.name}
                    </Text>
                  </View>
                </View>
                {[
                  {
                    label: "Name *",
                    value: newItemName,
                    onChange: setNewItemName,
                    placeholder: "Item name",
                    keyboard: "default",
                  },
                  {
                    label: "Unit",
                    value: newItemUnit,
                    onChange: setNewItemUnit,
                    placeholder: "e.g. pcs, kg",
                    keyboard: "default",
                  },
                ].map((f) => (
                  <View key={f.label}>
                    <Text style={fieldLabel}>{f.label}</Text>
                    <TextInput
                      value={f.value}
                      onChangeText={f.onChange}
                      placeholder={f.placeholder}
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Cost / Unit</Text>
                    <TextInput
                      value={newItemCost}
                      onChangeText={setNewItemCost}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>PO Quantity</Text>
                    <TextInput
                      value={newItemPOQty}
                      onChangeText={setNewItemPOQty}
                      keyboardType="number-pad"
                      placeholder="1"
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Stock Qty</Text>
                    <TextInput
                      value={newItemStock}
                      onChangeText={setNewItemStock}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={fieldLabel}>Reorder Point</Text>
                    <TextInput
                      value={newItemReorder}
                      onChangeText={setNewItemReorder}
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.muted}
                      style={inputStyle}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => setNewItemModalOpen(false)}
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.label,
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateNewItem}
                    style={{
                      flex: 1,
                      paddingVertical: 9,
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Add Item
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </DialogContent>
      </Dialog>

      <POVendorsSheet
        ref={vendorsSheetRef}
        onUseTemplate={(poId) => {
          const po = purchaseOrders.find((p) => p.id === poId);
          vendorsSheetRef.current?.close();
          if (!po) return;
          setLineItems(po.items);
          setSelectedVendorId(po.vendorId);
        }}
        onSelectVendor={(vendorId) => {
          setSelectedVendorId(vendorId);
          vendorsSheetRef.current?.close();
        }}
      />
    </>
  );
};

export default CreatePurchaseOrderScreen;
