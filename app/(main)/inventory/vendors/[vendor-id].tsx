import VendorCreatePOModule from "@/components/inventory/VendorCreatePOModule";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
} from "@/components/ui/bottomSheet";
import { BottomSheetMethods } from "@/components/ui/bottomSheet";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Building2,
  Mail,
  Package,
  Phone,
  Plus,
  Search,
  User,
} from "lucide-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const StatCard = ({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: s(10),
        padding: s(12),
        marginRight: s(8),
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
        {label}
      </Text>
      <Text
        style={{
          fontSize: s(20),
          fontWeight: "700",
          color: accent || colors.heading,
          marginTop: s(4),
        }}
      >
        {value}
      </Text>
    </View>
  );
};

const statusStyle = (status: string) => {
  switch (status) {
    case "Awaiting Payment":
      return {
        bg: colors.success + "20",
        border: colors.success + "50",
        text: colors.success,
      };
    case "Pending Delivery":
      return {
        bg: colors.info + "20",
        border: colors.info + "50",
        text: colors.info,
      };
    case "Draft":
      return {
        bg: colors.muted + "20",
        border: colors.border,
        text: colors.muted,
      };
    default:
      return {
        bg: colors.warning + "20",
        border: colors.warning + "50",
        text: colors.warning,
      };
  }
};

const VendorDetailsScreen = () => {
  const params = useLocalSearchParams();
  const router = useRouter();
  const rawId = (params as any).vendorId || (params as any)["vendor-id"];
  const vendorId = Array.isArray(rawId) ? rawId[0] : rawId;
  const rawCreatePO = (params as any).createPO;
  const createPOFlag = Array.isArray(rawCreatePO)
    ? rawCreatePO[0]
    : rawCreatePO;
  const [activeTab, setActiveTab] = useState<
    "purchase-orders" | "associated-items"
  >("purchase-orders");

  const uiScale = useUiScale();
  const sc = (n: number) => Math.round(n * uiScale);

  const { vendors, purchaseOrders, inventoryItems } = useInventoryStore();
  const vendor = vendors.find((v) => v.id === vendorId);

  const vendorPOs = useMemo(
    () => purchaseOrders.filter((po) => po.vendorId === vendorId),
    [purchaseOrders, vendorId],
  );

  const associatedItems = useMemo(
    () => inventoryItems.filter((item) => item.vendorId === vendorId),
    [inventoryItems, vendorId],
  );

  const getItemName = (inventoryItemId: string) => {
    const item = inventoryItems.find((i) => i.id === inventoryItemId);
    return item?.name || "Item";
  };

  const stats = useMemo(() => {
    const totalPOs = vendorPOs.length;
    const received = vendorPOs.filter(
      (po) => po.status === "Awaiting Payment",
    ).length;
    const inDraft = vendorPOs.filter((po) => po.status === "Draft").length;
    const sent = vendorPOs.filter(
      (po) => po.status === "Pending Delivery",
    ).length;
    const totalLines = vendorPOs.reduce((acc, po) => acc + po.items.length, 0);
    const totalQty = vendorPOs.reduce(
      (acc, po) => acc + po.items.reduce((a, li) => a + li.quantity, 0),
      0,
    );
    const estSpend = vendorPOs.reduce(
      (acc, po) =>
        acc + po.items.reduce((a, li) => a + li.quantity * li.cost, 0),
      0,
    );
    return {
      totalPOs,
      received,
      inDraft,
      sent,
      totalLines,
      totalQty,
      estSpend,
    };
  }, [vendorPOs]);

  const poSearchRef = useRef<BottomSheetMethods>(null);
  const itemSearchRef = useRef<BottomSheetMethods>(null);

  const [poSearchText, setPoSearchText] = useState("");
  const [itemSearchText, setItemSearchText] = useState("");
  const [poStartDate, setPoStartDate] = useState("");
  const [poEndDate, setPoEndDate] = useState("");
  const [isPoSearchOpen, setIsPoSearchOpen] = useState(false);
  const [isItemSearchOpen, setIsItemSearchOpen] = useState(false);
  const [poModuleOpenSignal, setPoModuleOpenSignal] = useState(0);
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  useEffect(() => {
    if (createPOFlag === "1" && vendorId) {
      setPoModuleOpenSignal((s) => s + 1);
      router.replace(`/inventory/vendors/${vendorId}`);
    }
  }, [createPOFlag, vendorId, router]);

  const filteredPOs = useMemo(() => {
    const q = poSearchText.trim().toLowerCase();
    const sd = poStartDate ? new Date(poStartDate + "T00:00:00") : null;
    const ed = poEndDate ? new Date(poEndDate + "T23:59:59") : null;
    return vendorPOs.filter((po) => {
      const inDates =
        (!sd || new Date(po.createdAt) >= sd) &&
        (!ed || new Date(po.createdAt) <= ed);
      if (!q) return inDates;
      const poNum = po.poNumber?.toLowerCase() || "";
      const status = po.status?.toLowerCase() || "";
      const created = new Date(po.createdAt).toLocaleString().toLowerCase();
      const emp = `${po.createdByEmployeeName || ""}`.toLowerCase();
      return (
        inDates &&
        (poNum.includes(q) ||
          status.includes(q) ||
          created.includes(q) ||
          emp.includes(q))
      );
    });
  }, [poSearchText, vendorPOs, poStartDate, poEndDate]);

  const filteredItems = useMemo(() => {
    const q = itemSearchText.trim().toLowerCase();
    if (!q) return associatedItems;
    return associatedItems.filter((it) => {
      const name = it.name?.toLowerCase() || "";
      const category = it.category?.toLowerCase() || "";
      return name.includes(q) || category.includes(q);
    });
  }, [itemSearchText, associatedItems]);

  const buildPurchaseOrderHref = (poId: string) => ({
    pathname: "/inventory/purchase-orders/[poId]" as const,
    params: {
      poId,
      returnTo: `/inventory/vendors/${vendorId}`,
    },
  });

  const openPurchaseOrder = (poId: string) => {
    router.push(buildPurchaseOrderHref(poId));
  };

  useEffect(() => {
    if (isPoSearchOpen) {
      requestAnimationFrame(() => {
        poSearchRef.current?.snapToIndex?.(1);
      });
    }
  }, [isPoSearchOpen]);

  useEffect(() => {
    if (isItemSearchOpen) {
      requestAnimationFrame(() => {
        itemSearchRef.current?.snapToIndex?.(0);
      });
    }
  }, [isItemSearchOpen]);

  if (!vendor) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.screen,
          padding: sc(16),
        }}
      >
        <View
          style={{
            width: sc(48),
            height: sc(48),
            borderRadius: sc(12),
            backgroundColor: colors.danger + "15",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: sc(12),
          }}
        >
          <AlertTriangle size={sc(22)} color={colors.danger} />
        </View>
        <Text
          style={{
            fontSize: sc(15),
            fontWeight: "700",
            color: colors.heading,
            marginBottom: sc(6),
          }}
        >
          Vendor Not Found
        </Text>
        <Text
          style={{
            fontSize: sc(13),
            color: colors.muted,
            textAlign: "center",
            marginBottom: sc(20),
          }}
        >
          This vendor does not exist or may have been removed.
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/inventory/vendors")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: sc(6),
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "50",
            borderRadius: sc(8),
            paddingHorizontal: sc(14),
            paddingVertical: sc(8),
          }}
        >
          <ArrowLeft size={sc(14)} color={colors.teal} />
          <Text
            style={{ fontSize: sc(13), fontWeight: "600", color: colors.teal }}
          >
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: colors.screen }}>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: sc(12), gap: sc(10) }}
        >
          {/* Vendor Header Card */}
          <View
            style={{
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: sc(12),
              padding: sc(14),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: sc(12),
                marginBottom: sc(12),
              }}
            >
              <View
                style={{
                  width: sc(40),
                  height: sc(40),
                  borderRadius: sc(10),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={sc(18)} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: sc(15),
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  {vendor.name}
                </Text>
                {!!vendor.description && (
                  <Text
                    style={{
                      fontSize: sc(12),
                      color: colors.label,
                      marginTop: sc(2),
                    }}
                  >
                    {vendor.description}
                  </Text>
                )}
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: sc(20) }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sc(6),
                }}
              >
                <User size={sc(12)} color={colors.muted} />
                <Text style={{ fontSize: sc(12), color: colors.label }}>
                  {vendor.contactName || "—"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sc(6),
                }}
              >
                <Phone size={sc(12)} color={colors.muted} />
                <Text style={{ fontSize: sc(12), color: colors.label }}>
                  {vendor.phone || "â€”"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: sc(6),
                }}
              >
                <Mail size={sc(12)} color={colors.muted} />
                <Text style={{ fontSize: sc(12), color: colors.label }}>
                  {vendor.email || "â€”"}
                </Text>
              </View>
            </View>
          </View>

          {/* Stats Row 1 */}
          <View style={{ flexDirection: "row" }}>
            <StatCard label="Total POs" value={stats.totalPOs} />
            <StatCard
              label="Received"
              value={stats.received}
              accent={colors.success}
            />
            <StatCard label="Ordered" value={stats.sent} accent={colors.info} />
            <StatCard
              label="Draft"
              value={stats.inDraft}
              accent={colors.muted}
            />
          </View>

          {/* Stats Row 2 */}
          <View style={{ flexDirection: "row", marginTop: sc(-2) }}>
            <StatCard label="Line Items" value={stats.totalLines} />
            <StatCard label="Total Qty" value={stats.totalQty} />
            <StatCard
              label="Est. Spend"
              value={`$${stats.estSpend.toFixed(2)}`}
              accent={colors.teal}
            />
            <View style={{ flex: 1, marginRight: sc(8) }} />
          </View>

          {/* Tab Bar */}
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            {(["purchase-orders", "associated-items"] as const).map((tab) => {
              const isActive = activeTab === tab;
              const label =
                tab === "purchase-orders"
                  ? "Purchase Orders"
                  : "Associated Items";
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  style={{
                    paddingHorizontal: sc(14),
                    paddingVertical: sc(9),
                    borderBottomWidth: 2,
                    borderBottomColor: isActive ? colors.teal : "transparent",
                    marginBottom: sc(-1),
                  }}
                >
                  <Text
                    style={{
                      fontSize: sc(13),
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

          {/* Purchase Orders Tab */}
          {activeTab === "purchase-orders" && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: sc(12),
                overflow: "hidden",
              }}
            >
              {/* Tab header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: sc(12),
                  paddingVertical: sc(9),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.screen,
                }}
              >
                <Text
                  style={{
                    fontSize: sc(12),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Purchase Orders
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: sc(8),
                    alignItems: "center",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setIsPoSearchOpen(true)}
                    style={{
                      backgroundColor: colors.teal + "15",
                      borderRadius: sc(8),
                      padding: sc(7),
                    }}
                  >
                    <Search size={sc(14)} color={colors.teal} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setPoModuleOpenSignal((s) => s + 1)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: sc(5),
                      paddingHorizontal: sc(10),
                      paddingVertical: sc(6),
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                      borderRadius: sc(8),
                    }}
                  >
                    <Plus size={sc(13)} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: sc(12),
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Create
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {vendorPOs.length === 0 ? (
                <View
                  style={{
                    paddingVertical: sc(40),
                    alignItems: "center",
                    gap: sc(6),
                  }}
                >
                  <Package size={sc(20)} color={colors.muted} />
                  <Text style={{ fontSize: sc(13), color: colors.muted }}>
                    No purchase orders yet.
                  </Text>
                </View>
              ) : (
                vendorPOs.map((po, index) => {
                  const itemsCount = po.items.length;
                  const qty = po.items.reduce((a, li) => a + li.quantity, 0);
                  const amount = po.items.reduce(
                    (a, li) => a + li.quantity * li.cost,
                    0,
                  );
                  const s = statusStyle(po.status);
                  return (
                    <Pressable
                      key={`${po.id}-${index}`}
                      onPress={() => openPurchaseOrder(po.id)}
                      onStartShouldSetResponder={() => true}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingHorizontal: sc(12),
                        paddingVertical: sc(10),
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 10 }}>
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: sc(8),
                          }}
                        >
                          <Text
                            style={{
                              fontSize: sc(13),
                              fontWeight: "600",
                              color: colors.heading,
                            }}
                          >
                            {po.poNumber}
                          </Text>
                          <View
                            style={{
                              backgroundColor: s.bg,
                              borderWidth: 1,
                              borderColor: s.border,
                              borderRadius: sc(20),
                              paddingHorizontal: sc(7),
                              paddingVertical: sc(2),
                            }}
                          >
                            <Text
                              style={{
                                fontSize: sc(10),
                                fontWeight: "600",
                                color: s.text,
                              }}
                            >
                              {po.status}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={{
                            fontSize: sc(11),
                            color: colors.muted,
                            marginTop: sc(3),
                          }}
                        >
                          {new Date(po.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text
                          style={{
                            fontSize: sc(13),
                            fontWeight: "700",
                            color: colors.heading,
                          }}
                        >
                          ${amount.toFixed(2)}
                        </Text>
                        <Text
                          style={{
                            fontSize: sc(11),
                            color: colors.muted,
                            marginTop: sc(2),
                          }}
                        >
                          {itemsCount} lines Â· {qty} qty
                        </Text>
                      </View>
                    </Pressable>
                  );
                })
              )}
            </View>
          )}

          {/* Associated Items Tab */}
          {activeTab === "associated-items" && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: sc(12),
                overflow: "hidden",
              }}
            >
              {/* Tab header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: sc(12),
                  paddingVertical: sc(9),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: colors.screen,
                }}
              >
                <Text
                  style={{
                    fontSize: sc(12),
                    fontWeight: "600",
                    color: colors.muted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Associated Items
                </Text>
                <TouchableOpacity
                  onPress={() => setIsItemSearchOpen(true)}
                  style={{
                    backgroundColor: colors.teal + "15",
                    borderRadius: sc(8),
                    padding: sc(7),
                  }}
                >
                  <Search size={sc(14)} color={colors.teal} />
                </TouchableOpacity>
              </View>

              {associatedItems.length === 0 ? (
                <View
                  style={{
                    paddingVertical: sc(40),
                    alignItems: "center",
                    gap: sc(6),
                  }}
                >
                  <Box size={sc(20)} color={colors.muted} />
                  <Text style={{ fontSize: sc(13), color: colors.muted }}>
                    No items linked yet.
                  </Text>
                </View>
              ) : (
                associatedItems.map((item, index) => {
                  const isLowStock =
                    item.stockQuantity <= item.reorderThreshold;
                  return (
                    <Link
                      key={`${item.id}-${index}`}
                      href={`/inventory/ingredient-items/${item.id}`}
                      asChild
                    >
                      <TouchableOpacity
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          alignItems: "center",
                          paddingHorizontal: sc(12),
                          paddingVertical: sc(10),
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 10 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: sc(8),
                            }}
                          >
                            <Text
                              style={{
                                fontSize: sc(13),
                                fontWeight: "600",
                                color: colors.heading,
                              }}
                            >
                              {item.name}
                            </Text>
                            <View
                              style={{
                                backgroundColor: isLowStock
                                  ? colors.danger + "20"
                                  : colors.success + "20",
                                borderWidth: 1,
                                borderColor: isLowStock
                                  ? colors.danger + "50"
                                  : colors.success + "50",
                                borderRadius: sc(20),
                                paddingHorizontal: sc(7),
                                paddingVertical: sc(2),
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: sc(10),
                                  fontWeight: "600",
                                  color: isLowStock
                                    ? colors.danger
                                    : colors.success,
                                }}
                              >
                                {isLowStock ? "Low Stock" : "In Stock"}
                              </Text>
                            </View>
                          </View>
                          <Text
                            style={{
                              fontSize: sc(11),
                              color: colors.muted,
                              marginTop: sc(3),
                            }}
                          >
                            {item.category} Â· {item.stockQuantity} {item.unit}{" "}
                            Â· Reorder at {item.reorderThreshold}
                          </Text>
                        </View>
                        <View style={{ alignItems: "flex-end" }}>
                          <Text
                            style={{
                              fontSize: sc(13),
                              fontWeight: "700",
                              color: colors.heading,
                            }}
                          >
                            ${item.cost.toFixed(2)}
                          </Text>
                          <Text
                            style={{
                              fontSize: sc(11),
                              color: colors.muted,
                              marginTop: sc(2),
                            }}
                          >
                            per {item.unit}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </Link>
                  );
                })
              )}
            </View>
          )}
        </ScrollView>
      </View>

      {/* PO Search Sheet */}
      {isPoSearchOpen && (
        <BottomSheet
          ref={poSearchRef as any}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          onClose={() => setIsPoSearchOpen(false)}
          {...bottomSheetTheme}
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              opacity={0.7}
            />
          )}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: sc(12),
              paddingVertical: sc(10),
              gap: sc(8),
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: sc(8),
                paddingHorizontal: sc(10),
                height: sc(38),
                gap: sc(8),
              }}
            >
              <Search size={sc(14)} color={colors.muted} />
              <BottomSheetTextInput
                value={poSearchText}
                onChangeText={setPoSearchText}
                placeholder="Search POs..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: sc(13), color: colors.heading }}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                setPoSearchText("");
                poSearchRef.current?.close();
                setIsPoSearchOpen(false);
              }}
            >
              <Text
                style={{
                  fontSize: sc(13),
                  fontWeight: "600",
                  color: colors.label,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: sc(12), paddingBottom: 10 }}>
            <Text
              style={{
                fontSize: sc(11),
                color: colors.muted,
                marginBottom: sc(6),
              }}
            >
              Date Range
            </Text>
            <DateRangePicker
              startDate={poStartDate}
              endDate={poEndDate}
              onDateRangeChange={(start, end) => {
                setPoStartDate(start);
                setPoEndDate(end);
              }}
              placeholder="Select date range"
            />
          </View>
          <BottomSheetFlatList
            data={filteredPOs}
            keyExtractor={(po, index) => `${po.id}-${index}`}
            renderItem={({ item: po }) => (
              <Pressable
                onPress={() => openPurchaseOrder(po.id)}
                onStartShouldSetResponder={() => true}
                style={{
                  paddingHorizontal: sc(12),
                  paddingVertical: sc(10),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: sc(13),
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    {po.poNumber}
                  </Text>
                  <Text
                    style={{
                      fontSize: sc(11),
                      color: colors.label,
                      marginTop: sc(2),
                    }}
                  >
                    {po.status} Â· {new Date(po.createdAt).toLocaleDateString()}
                  </Text>
                  {po.createdByEmployeeName && (
                    <Text style={{ fontSize: sc(11), color: colors.muted }}>
                      By: {po.createdByEmployeeName}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    fontSize: sc(13),
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  $
                  {po.items
                    .reduce((a, li) => a + li.quantity * li.cost, 0)
                    .toFixed(2)}
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  height: sc(120),
                }}
              >
                <Text style={{ fontSize: sc(13), color: colors.muted }}>
                  No purchase orders found
                </Text>
              </View>
            }
          />
        </BottomSheet>
      )}

      {/* Associated Items Search Sheet */}
      {isItemSearchOpen && (
        <BottomSheet
          ref={itemSearchRef as any}
          index={-1}
          snapPoints={snapPoints}
          enablePanDownToClose
          onClose={() => setIsItemSearchOpen(false)}
          {...bottomSheetTheme}
          backdropComponent={(props) => (
            <BottomSheetBackdrop
              {...props}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              opacity={0.7}
            />
          )}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: sc(12),
              paddingVertical: sc(10),
              gap: sc(8),
            }}
          >
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: sc(8),
                paddingHorizontal: sc(10),
                height: sc(38),
                gap: sc(8),
              }}
            >
              <Search size={sc(14)} color={colors.muted} />
              <BottomSheetTextInput
                value={itemSearchText}
                onChangeText={setItemSearchText}
                placeholder="Search items..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: sc(13), color: colors.heading }}
              />
            </View>
            <TouchableOpacity
              onPress={() => {
                setItemSearchText("");
                itemSearchRef.current?.close();
                setIsItemSearchOpen(false);
              }}
            >
              <Text
                style={{
                  fontSize: sc(13),
                  fontWeight: "600",
                  color: colors.label,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
          <BottomSheetFlatList
            data={filteredItems}
            keyExtractor={(it, index) => `${it.id}-${index}`}
            renderItem={({ item: it }) => (
              <Link href={`/inventory/ingredient-items/${it.id}`} asChild>
                <TouchableOpacity
                  style={{
                    paddingHorizontal: sc(12),
                    paddingVertical: sc(10),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: sc(13),
                        fontWeight: "600",
                        color: colors.heading,
                      }}
                    >
                      {it.name}
                    </Text>
                    <Text
                      style={{
                        fontSize: sc(11),
                        color: colors.label,
                        marginTop: sc(2),
                      }}
                    >
                      {it.category} Â· {it.stockQuantity} {it.unit}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: sc(13),
                      fontWeight: "600",
                      color: colors.heading,
                    }}
                  >
                    ${it.cost.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              </Link>
            )}
            ListEmptyComponent={
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  height: sc(120),
                }}
              >
                <Text style={{ fontSize: sc(13), color: colors.muted }}>
                  No items found
                </Text>
              </View>
            }
            enableFooterMarginAdjustment
          />
        </BottomSheet>
      )}

      <VendorCreatePOModule
        vendorId={vendorId!}
        vendorName={vendor.name}
        vendorPOs={vendorPOs}
        items={inventoryItems}
        resolveItemName={getItemName}
        openSignal={poModuleOpenSignal}
      />
    </>
  );
};

export default VendorDetailsScreen;
