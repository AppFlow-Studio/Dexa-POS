import AddExpenseModule from "@/components/inventory/AddExpenseModule";
import VendorCreatePOModule from "@/components/inventory/VendorCreatePOModule";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useToast } from "@/contexts/ToastContext";
import { useInventoryWriteGate } from "@/hooks/inventory/useInventoryWriteGate";
import { colors } from "@/lib/theme";
import { PurchaseOrder } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { Link } from "expo-router";
import { Package, Plus, Receipt, Search, Trash2, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const statusStyle = (status: string) => {
  switch (status) {
    case "Awaiting Payment":
      return {
        bg: colors.teal + "1A",
        border: colors.teal + "55",
        text: colors.teal,
      };
    case "Pending Delivery":
      return {
        bg: colors.teal + "14",
        border: colors.teal + "45",
        text: colors.teal,
      };
    case "Draft":
      return {
        bg: colors.teal + "12",
        border: colors.teal + "35",
        text: colors.teal,
      };
    case "Paid":
      return {
        bg: colors.teal + "22",
        border: colors.teal + "60",
        text: colors.teal,
      };
    case "Cancelled":
      return {
        bg: colors.danger + "18",
        border: colors.danger + "55",
        text: colors.danger,
      };
    default:
      return {
        bg: colors.danger + "18",
        border: colors.danger + "55",
        text: colors.danger,
      };
  }
};

const PurchaseOrderRow: React.FC<{
  item: PurchaseOrder;
  onDelete: () => void;
}> = ({ item, onDelete }) => {
  const vendors = useInventoryStore((s) => s.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);
  const totalQty = item.items.reduce((a, li) => a + li.quantity, 0);
  const totalCost = item.items.reduce((a, li) => a + li.cost * li.quantity, 0);
  const s = statusStyle(item.status);
  const uiScale = useUiScale();
  const sc = (n: number) => Math.round(n * uiScale);

  return (
    <Link href={`/inventory/purchase-orders/${item.id}`} asChild>
      <TouchableOpacity
        style={{
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
          borderLeftWidth: 3,
          borderLeftColor:
            item.status === "Cancelled" ? colors.danger : colors.teal,
          borderRadius: sc(10),
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: sc(12),
          paddingVertical: sc(10),
          marginHorizontal: sc(10),
          marginTop: sc(8),
        }}
      >
        {/* PO Number */}
        <Text
          numberOfLines={1}
          style={{
            width: "14%",
            fontSize: sc(13),
            fontWeight: "600",
            color: colors.teal,
          }}
        >
          {item.poNumber}
        </Text>

        {/* Vendor */}
        <Text
          numberOfLines={1}
          style={{ width: "18%", fontSize: sc(12), color: colors.heading }}
        >
          {vendor?.name || "—"}
        </Text>

        {/* Status */}
        <View style={{ width: "16%" }}>
          <View
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: sc(8),
              paddingVertical: sc(3),
              backgroundColor: s.bg,
              borderWidth: 1,
              borderColor: s.border,
              borderRadius: 20,
            }}
          >
            <Text
              style={{ fontSize: sc(10), fontWeight: "600", color: s.text }}
            >
              {item.status}
            </Text>
          </View>
        </View>

        {/* Date */}
        <Text
          numberOfLines={1}
          style={{ width: "14%", fontSize: sc(12), color: colors.label }}
        >
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        {/* Employee */}
        <Text
          numberOfLines={1}
          style={{ width: "16%", fontSize: sc(12), color: colors.label }}
        >
          {item.createdByEmployeeName || "—"}
        </Text>

        {/* Items */}
        <Text
          numberOfLines={1}
          style={{ width: "9%", fontSize: sc(12), color: colors.label }}
        >
          {totalQty}
        </Text>

        {/* Total */}
        <Text
          numberOfLines={1}
          style={{
            width: "10%",
            fontSize: sc(13),
            fontWeight: "600",
            color: colors.teal,
          }}
        >
          ${totalCost.toFixed(2)}
        </Text>

        {/* Delete */}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            style={{ padding: sc(6) }}
          >
            <Trash2 size={sc(14)} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

const PurchaseOrdersScreen = () => {
  const {
    purchaseOrders,
    vendors,
    inventoryItems,
    deletePurchaseOrder,
    externalExpenses,
    removeExternalExpense,
  } = useInventoryStore();
  const { show } = useToast();

  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"purchase-orders" | "expenses">(
    "purchase-orders",
  );
  const [isVendorPickerOpen, setIsVendorPickerOpen] = useState(false);
  const [vendorPickerQuery, setVendorPickerQuery] = useState("");
  const [poModuleVendorId, setPoModuleVendorId] = useState<string | null>(null);
  const [poModuleOpenSignal, setPoModuleOpenSignal] = useState(0);
  const [expenseModuleOpenSignal, setExpenseModuleOpenSignal] = useState(0);
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  // Reads work offline from the mirror; writes do not. See Phase 5 in
  // docs/engineering/architecture/sqlite-offline-first.md.
  const { canWrite, blockedReason } = useInventoryWriteGate();

  const poModuleVendor = useMemo(
    () => vendors.find((v) => v.id === poModuleVendorId) || null,
    [vendors, poModuleVendorId],
  );

  const vendorPickerResults = useMemo(() => {
    const q = vendorPickerQuery.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.contactName, v.email, v.phone]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q)),
    );
  }, [vendors, vendorPickerQuery]);

  const handleRemoveExpense = async (expenseId: string) => {
    const e = externalExpenses.find((x) => x.id === expenseId);
    try {
      await removeExternalExpense(expenseId);
      show({
        title: "Expense Removed",
        message: `Expense ${e?.expenseNumber || ""} removed.`,
        type: "success",
      });
    } catch {
      show({
        title: "Remove Failed",
        message: `Could not remove expense ${e?.expenseNumber || ""}.`,
        type: "error",
      });
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sd = startDate ? new Date(startDate + "T00:00:00") : null;
    const ed = endDate ? new Date(endDate + "T23:59:59") : null;
    return purchaseOrders.filter((po) => {
      const inDates =
        (!sd || new Date(po.createdAt) >= sd) &&
        (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const vendorName =
        useInventoryStore
          .getState()
          .vendors.find((v) => v.id === po.vendorId)
          ?.name?.toLowerCase() || "";
      return (
        inDates &&
        ((po.poNumber?.toLowerCase() || "").includes(q) ||
          vendorName.includes(q) ||
          (po.createdByEmployeeName || "").toLowerCase().includes(q) ||
          po.status.toLowerCase().includes(q))
      );
    });
  }, [purchaseOrders, query, startDate, endDate]);

  const filteredExpenses = useMemo(() => {
    const q = expenseQuery.trim().toLowerCase();
    if (!q) return externalExpenses;
    return externalExpenses.filter((expense) => {
      return (
        expense.expenseNumber.toLowerCase().includes(q) ||
        expense.purchasedByEmployeeName.toLowerCase().includes(q) ||
        (expense.storeName || "").toLowerCase().includes(q) ||
        (expense.relatedPONumber || "").toLowerCase().includes(q) ||
        expense.items.some((li) => li.itemName.toLowerCase().includes(q))
      );
    });
  }, [externalExpenses, expenseQuery]);

  const TABLE_HEADERS: {
    label: string;
    width?: import("react-native").DimensionValue;
    flex?: number;
  }[] = [
    { label: "PO Number", width: "14%" as const },
    { label: "Vendor", width: "18%" as const },
    { label: "Status", width: "16%" as const },
    { label: "Date", width: "14%" as const },
    { label: "Employee", width: "16%" as const },
    { label: "Qty", width: "9%" as const },
    { label: "Total", width: "10%" as const },
    { label: "", flex: 1 },
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: colors.screen }}
    >
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        {/* Tab bar + actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            paddingHorizontal: s(2),
            paddingBottom: s(8),
          }}
        >
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            {(["purchase-orders", "expenses"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const label =
                tab === "purchase-orders"
                  ? "Purchase Orders"
                  : "External Expenses";
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    paddingHorizontal: s(14),
                    paddingVertical: s(9),
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? colors.teal : "transparent",
                    marginBottom: -1,
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: "600",
                      color: isActive ? colors.teal : colors.label,
                    }}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Modal
          transparent
          visible={isVendorPickerOpen}
          animationType="fade"
          onRequestClose={() => setIsVendorPickerOpen(false)}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.45)",
              alignItems: "center",
              justifyContent: "center",
              padding: s(16),
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 620,
                maxHeight: "82%",
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(14),
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: s(14),
                  paddingVertical: s(12),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(14),
                      fontWeight: "700",
                      color: colors.heading,
                    }}
                  >
                    Select Vendor
                  </Text>
                  <TouchableOpacity
                    onPress={() => setIsVendorPickerOpen(false)}
                    style={{ padding: s(6) }}
                  >
                    <X size={s(16)} color={colors.muted} />
                  </TouchableOpacity>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    paddingHorizontal: s(10),
                    height: s(38),
                    gap: s(8),
                    marginTop: s(8),
                  }}
                >
                  <Search size={s(14)} color={colors.muted} />
                  <TextInput
                    value={vendorPickerQuery}
                    onChangeText={setVendorPickerQuery}
                    placeholder="Search vendors..."
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, fontSize: s(13), color: colors.heading }}
                  />
                </View>
              </View>

              <ScrollView
                contentContainerStyle={{ padding: s(14), paddingBottom: s(18) }}
              >
                {vendorPickerResults.length === 0 ? (
                  <View
                    style={{ alignItems: "center", paddingVertical: s(22) }}
                  >
                    <Text style={{ fontSize: s(12), color: colors.muted }}>
                      No vendors found
                    </Text>
                  </View>
                ) : (
                  vendorPickerResults.map((v) => (
                    <TouchableOpacity
                      key={v.id}
                      onPress={() => {
                        setPoModuleVendorId(v.id);
                        setPoModuleOpenSignal((s) => s + 1);
                        setIsVendorPickerOpen(false);
                        setVendorPickerQuery("");
                      }}
                      style={{
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: s(8),
                        paddingHorizontal: s(12),
                        paddingVertical: s(10),
                        marginBottom: s(8),
                      }}
                    >
                      <Text
                        style={{
                          fontSize: s(13),
                          fontWeight: "600",
                          color: colors.heading,
                        }}
                      >
                        {v.name}
                      </Text>
                      <Text
                        style={{
                          fontSize: s(11),
                          color: colors.muted,
                          marginTop: s(2),
                        }}
                      >
                        {v.contactName || "No contact"}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Purchase Orders Tab */}
        {activeTab === "purchase-orders" && (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: s(12),
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.heading,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                Purchase Orders Table
              </Text>
              <Text style={{ fontSize: s(11), color: colors.muted }}>
                {filtered.length} results
              </Text>
            </View>

            {/* Filters */}
            <View
              style={{
                flexDirection: "row",
                gap: s(10),
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.screen,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: s(5),
                  }}
                >
                  Search
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: s(8),
                    paddingHorizontal: s(10),
                    height: s(38),
                    gap: s(8),
                  }}
                >
                  <Search size={s(13)} color={colors.muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="PO number, vendor, employee..."
                    placeholderTextColor={colors.muted}
                    style={{
                      flex: 1,
                      fontSize: s(13),
                      color: colors.heading,
                      paddingVertical: 0,
                    }}
                  />
                  {!!query && (
                    <TouchableOpacity
                      onPress={() => setQuery("")}
                      style={{ padding: s(3) }}
                    >
                      <X size={s(14)} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: s(5),
                  }}
                >
                  Date Range
                </Text>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={(sd, ed) => {
                    setStartDate(sd);
                    setEndDate(ed);
                  }}
                  placeholder="Select date range"
                />
              </View>

              <View style={{ justifyContent: "flex-end" }}>
                <TouchableOpacity
                  onPress={() => setIsVendorPickerOpen(true)}
                  disabled={!canWrite}
                  accessibilityState={{ disabled: !canWrite }}
                  accessibilityHint={blockedReason ?? undefined}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(6),
                    paddingHorizontal: s(12),
                    height: s(38),
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: s(8),
                    opacity: canWrite ? 1 : 0.4,
                  }}
                >
                  <Plus size={s(13)} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: "600",
                      color: colors.teal,
                    }}
                  >
                    Create PO
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Table headers */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              {TABLE_HEADERS.map((h, i) => (
                <Text
                  key={i}
                  style={[
                    {
                      fontSize: 11,
                      fontWeight: "600",
                      color: colors.muted,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    },
                    h.width ? { width: h.width } : { flex: 1 },
                  ]}
                >
                  {h.label}
                </Text>
              ))}
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ paddingBottom: 20, paddingTop: 2 }}
              renderItem={({ item }) => (
                <PurchaseOrderRow
                  item={item}
                  onDelete={() => setPoToDelete(item)}
                />
              )}
              ListEmptyComponent={
                <View
                  style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.teal + "15",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Package size={20} color={colors.teal} />
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    No purchase orders
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Create your first PO to get started
                  </Text>
                </View>
              }
            />
          </View>
        )}

        {/* Expenses Tab */}
        {activeTab === "expenses" && (
          <View
            style={{
              flex: 1,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.panel,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: colors.heading,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                }}
              >
                External Expenses Table
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {filteredExpenses.length} results
              </Text>
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                paddingHorizontal: 12,
                paddingBottom: 8,
                paddingTop: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.screen,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    marginBottom: 5,
                  }}
                >
                  Search Expenses
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: expenseQuery
                      ? colors.teal + "55"
                      : colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 10,
                    height: 38,
                    gap: 8,
                  }}
                >
                  <Search
                    size={13}
                    color={expenseQuery ? colors.teal : colors.muted}
                  />
                  <TextInput
                    value={expenseQuery}
                    onChangeText={setExpenseQuery}
                    placeholder="Expense #, employee, store, related PO, item..."
                    placeholderTextColor={colors.muted}
                    style={{
                      flex: 1,
                      fontSize: 13,
                      color: colors.heading,
                      paddingVertical: 0,
                    }}
                  />
                  {!!expenseQuery && (
                    <TouchableOpacity
                      onPress={() => setExpenseQuery("")}
                      style={{ padding: 3 }}
                    >
                      <X size={14} color={colors.muted} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              <View style={{ justifyContent: "flex-end" }}>
                <TouchableOpacity
                  onPress={() => setExpenseModuleOpenSignal((s) => s + 1)}
                  disabled={!canWrite}
                  accessibilityState={{ disabled: !canWrite }}
                  accessibilityHint={blockedReason ?? undefined}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 12,
                    height: 38,
                    backgroundColor: colors.teal + "20",
                    borderWidth: 1,
                    borderColor: colors.teal + "50",
                    borderRadius: 8,
                    opacity: canWrite ? 1 : 0.4,
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
                    Add Expense
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <FlatList
              data={filteredExpenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
              renderItem={({ item }) => (
                <View
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.teal + "35",
                    borderLeftWidth: 3,
                    borderLeftColor: colors.teal,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "600",
                          color: colors.teal,
                        }}
                      >
                        {item.expenseNumber} · {item.items.length} items
                      </Text>
                      <Text
                        style={{
                          fontSize: 11,
                          color: colors.label,
                          marginTop: 2,
                        }}
                      >
                        By {item.purchasedByEmployeeName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {new Date(item.purchasedAt).toLocaleString()}
                      </Text>
                      {!!item.storeName && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.muted,
                            marginTop: 2,
                          }}
                        >
                          Store: {item.storeName}
                        </Text>
                      )}
                      {!!item.relatedPONumber && (
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.teal,
                            marginTop: 2,
                            fontWeight: "600",
                          }}
                        >
                          Related: {item.relatedPONumber}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: "700",
                          color: colors.teal,
                        }}
                      >
                        ${item.totalAmount.toFixed(2)}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveExpense(item.id)}
                        style={{ padding: 4 }}
                      >
                        <Trash2 size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {item.items.map((li, index) => (
                    <View
                      key={index}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingVertical: 6,
                        borderTopWidth: 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            color: colors.heading,
                            fontWeight: "600",
                          }}
                        >
                          {li.itemName} ×{li.quantity}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          ${li.unitPrice.toFixed(2)} each
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "600",
                          color: colors.teal,
                        }}
                      >
                        ${li.totalAmount.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  {item.notes && (
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginTop: 6,
                      }}
                    >
                      Notes: {item.notes}
                    </Text>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View
                  style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}
                >
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      backgroundColor: colors.teal + "15",
                      alignItems: "center",
                      justifyContent: "center",
                      marginBottom: 4,
                    }}
                  >
                    <Receipt size={20} color={colors.teal} />
                  </View>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    No expenses recorded
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Add expenses for items from other sources
                  </Text>
                </View>
              }
            />
          </View>
        )}

        <ConfirmationModal
          isOpen={!!poToDelete}
          onClose={() => setPoToDelete(null)}
          onConfirm={async () => {
            if (poToDelete) {
              try {
                await deletePurchaseOrder(poToDelete.id);
                show({
                  title: "PO Deleted",
                  message: `"${poToDelete.poNumber}" deleted.`,
                  type: "success",
                });
              } catch {
                show({
                  title: "Delete Failed",
                  message: `Could not delete "${poToDelete.poNumber}".`,
                  type: "error",
                });
              }
            }
            setPoToDelete(null);
          }}
          title="Delete PO"
          description={`Delete "${poToDelete?.poNumber}"? This cannot be undone.`}
          confirmText="Delete"
          variant="destructive"
        />

        {poModuleVendor && (
          <VendorCreatePOModule
            vendorId={poModuleVendor.id}
            vendorName={poModuleVendor.name}
            vendorPOs={purchaseOrders.filter(
              (po) => po.vendorId === poModuleVendor.id,
            )}
            items={inventoryItems}
            resolveItemName={(id: string) =>
              inventoryItems.find((i) => i.id === id)?.name || "Item"
            }
            openSignal={poModuleOpenSignal}
          />
        )}

        <AddExpenseModule openSignal={expenseModuleOpenSignal} />
      </View>
    </KeyboardAvoidingView>
  );
};

export default PurchaseOrdersScreen;
