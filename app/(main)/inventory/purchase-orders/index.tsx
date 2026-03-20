import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { PurchaseOrder } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { Link, useRouter } from "expo-router";
import { Package, Plus, Receipt, Search, Trash2 } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const statusStyle = (status: string) => {
  switch (status) {
    case "Awaiting Payment":
      return { bg: colors.success + "20", border: colors.success + "50", text: colors.success };
    case "Pending Delivery":
      return { bg: colors.info + "20", border: colors.info + "50", text: colors.info };
    case "Draft":
      return { bg: colors.muted + "15", border: colors.border, text: colors.muted };
    case "Paid":
      return { bg: colors.teal + "20", border: colors.teal + "50", text: colors.teal };
    case "Cancelled":
      return { bg: colors.danger + "20", border: colors.danger + "50", text: colors.danger };
    default:
      return { bg: colors.warning + "20", border: colors.warning + "50", text: colors.warning };
  }
};

const PurchaseOrderRow: React.FC<{ item: PurchaseOrder; onDelete: () => void }> = ({ item, onDelete }) => {
  const vendors = useInventoryStore((s) => s.vendors);
  const vendor = vendors.find((v) => v.id === item.vendorId);
  const totalQty = item.items.reduce((a, li) => a + li.quantity, 0);
  const totalCost = item.items.reduce((a, li) => a + li.cost * li.quantity, 0);
  const s = statusStyle(item.status);

  return (
    <Link href={`/inventory/purchase-orders/${item.id}`} asChild>
      <TouchableOpacity
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* PO Number */}
        <Text numberOfLines={1} style={{ width: "14%", fontSize: 13, fontWeight: "600", color: colors.heading }}>
          {item.poNumber}
        </Text>

        {/* Vendor */}
        <Text numberOfLines={1} style={{ width: "18%", fontSize: 12, color: colors.label }}>
          {vendor?.name || "—"}
        </Text>

        {/* Status */}
        <View style={{ width: "16%" }}>
          <View style={{ alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, backgroundColor: s.bg, borderWidth: 1, borderColor: s.border, borderRadius: 20 }}>
            <Text style={{ fontSize: 10, fontWeight: "600", color: s.text }}>{item.status}</Text>
          </View>
        </View>

        {/* Date */}
        <Text numberOfLines={1} style={{ width: "14%", fontSize: 12, color: colors.label }}>
          {new Date(item.createdAt).toLocaleDateString()}
        </Text>

        {/* Employee */}
        <Text numberOfLines={1} style={{ width: "16%", fontSize: 12, color: colors.label }}>
          {item.createdByEmployeeName || "—"}
        </Text>

        {/* Items */}
        <Text numberOfLines={1} style={{ width: "9%", fontSize: 12, color: colors.label }}>
          {totalQty}
        </Text>

        {/* Total */}
        <Text numberOfLines={1} style={{ width: "10%", fontSize: 13, fontWeight: "600", color: colors.heading }}>
          ${totalCost.toFixed(2)}
        </Text>

        {/* Delete */}
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <TouchableOpacity
            onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
            style={{ padding: 6 }}
          >
            <Trash2 size={14} color={colors.danger} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Link>
  );
};

const PurchaseOrdersScreen = () => {
  const { purchaseOrders, deletePurchaseOrder, externalExpenses, removeExternalExpense } = useInventoryStore();
  const router = useRouter();
  const { show } = useToast();

  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null);
  const [query, setQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [activeTab, setActiveTab] = useState<"purchase-orders" | "expenses">("purchase-orders");

  const handleRemoveExpense = (expenseId: string) => {
    const e = externalExpenses.find((x) => x.id === expenseId);
    removeExternalExpense(expenseId);
    show({ title: "Expense Removed", message: `Expense ${e?.expenseNumber || ""} removed.`, type: "success" });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sd = startDate ? new Date(startDate + "T00:00:00") : null;
    const ed = endDate ? new Date(endDate + "T23:59:59") : null;
    return purchaseOrders.filter((po) => {
      const inDates = (!sd || new Date(po.createdAt) >= sd) && (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const vendorName = useInventoryStore.getState().vendors.find((v) => v.id === po.vendorId)?.name?.toLowerCase() || "";
      return inDates && (
        (po.poNumber?.toLowerCase() || "").includes(q) ||
        vendorName.includes(q) ||
        (po.createdByEmployeeName || "").toLowerCase().includes(q) ||
        po.status.toLowerCase().includes(q)
      );
    });
  }, [purchaseOrders, query, startDate, endDate]);

  const TABLE_HEADERS = [
    { label: "PO Number", width: "14%" },
    { label: "Vendor", width: "18%" },
    { label: "Status", width: "16%" },
    { label: "Date", width: "14%" },
    { label: "Employee", width: "16%" },
    { label: "Qty", width: "9%" },
    { label: "Total", width: "10%" },
    { label: "", flex: 1 },
  ];

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>

        {/* Tab bar + actions */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 2,
            paddingBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border }}>
            {(["purchase-orders", "expenses"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const label = tab === "purchase-orders" ? "Purchase Orders" : "External Expenses";
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 9,
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? colors.teal : "transparent",
                    marginBottom: -1,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? colors.teal : colors.label }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {activeTab === "purchase-orders" ? (
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create")}
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
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Create PO</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => router.push("/inventory/purchase-orders/create-expense")}
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
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.teal }}>Add Expense</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Purchase Orders Tab */}
        {activeTab === "purchase-orders" && (
          <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
            {/* Filters */}
            <View
              style={{
                flexDirection: "row",
                gap: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.screen,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Search</Text>
                <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, height: 38, gap: 8 }}>
                  <Search size={13} color={colors.muted} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="PO number, vendor, employee..."
                    placeholderTextColor={colors.muted}
                    style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 0 }}
                  />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>Date Range</Text>
                <DateRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={(s, e) => { setStartDate(s); setEndDate(e); }}
                  placeholder="Select date range"
                />
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
                backgroundColor: colors.screen,
              }}
            >
              {TABLE_HEADERS.map((h, i) => (
                <Text
                  key={i}
                  style={[
                    { fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.5 },
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
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => (
                <PurchaseOrderRow
                  item={item}
                  onDelete={() => setPoToDelete(item)}
                />
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.teal + "15", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                    <Package size={20} color={colors.teal} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.heading }}>No purchase orders</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Create your first PO to get started</Text>
                </View>
              }
            />
          </View>
        )}

        {/* Expenses Tab */}
        {activeTab === "expenses" && (
          <View style={{ flex: 1, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: "hidden" }}>
            <FlatList
              data={externalExpenses}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
              renderItem={({ item }) => (
                <View
                  style={{
                    backgroundColor: colors.screen,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>
                        {item.expenseNumber} · {item.items.length} items
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.label, marginTop: 2 }}>
                        By {item.purchasedByEmployeeName}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        {new Date(item.purchasedAt).toLocaleString()}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 6 }}>
                      <Text style={{ fontSize: 14, fontWeight: "700", color: colors.success }}>
                        ${item.totalAmount.toFixed(2)}
                      </Text>
                      <TouchableOpacity onPress={() => handleRemoveExpense(item.id)} style={{ padding: 4 }}>
                        <Trash2 size={14} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {item.items.map((li, index) => (
                    <View
                      key={index}
                      style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 5, borderTopWidth: 1, borderTopColor: colors.border }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, color: colors.heading }}>{li.itemName} ×{li.quantity}</Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>${li.unitPrice.toFixed(2)} each</Text>
                      </View>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.success }}>${li.totalAmount.toFixed(2)}</Text>
                    </View>
                  ))}
                  {item.notes && (
                    <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>Notes: {item.notes}</Text>
                  )}
                </View>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: "center", paddingVertical: 48, gap: 8 }}>
                  <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.teal + "15", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                    <Receipt size={20} color={colors.teal} />
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: colors.heading }}>No expenses recorded</Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>Add expenses for items from other sources</Text>
                </View>
              }
            />
          </View>
        )}

        <ConfirmationModal
          isOpen={!!poToDelete}
          onClose={() => setPoToDelete(null)}
          onConfirm={() => {
            if (poToDelete) {
              deletePurchaseOrder(poToDelete.id);
              show({ title: "PO Deleted", message: `"${poToDelete.poNumber}" deleted.`, type: "success" });
            }
            setPoToDelete(null);
          }}
          title="Delete PO"
          description={`Delete "${poToDelete?.poNumber}"? This cannot be undone.`}
          confirmText="Delete"
          variant="destructive"
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default PurchaseOrdersScreen;
