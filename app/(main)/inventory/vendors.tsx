import VendorCreatePOModule from "@/components/inventory/VendorCreatePOModule";
import VendorFormModal from "@/components/inventory/VendorFormModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getHeaderHeight } from "@/lib/headerHeight";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { PurchaseOrder, Vendor } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import {
  registerVendorSidebarCloseHandler,
  setActiveVendorSidebarId,
} from "@/lib/vendorSidebarControl";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetSectionList,
} from "@gorhom/bottom-sheet";
import { Portal } from "@rn-primitives/portal";
import { useRouter } from "expo-router";
import {
  Building2,
  Edit,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
  User,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const STATUS_COLORS: Record<string, string> = {
  Draft: "#6B7280",
  "Pending Delivery": "#F59E0B",
  "Awaiting Payment": "#3B82F6",
  Paid: "#10B981",
  Cancelled: "#EF4444",
};

const VendorSidebar: React.FC<{
  vendor: Vendor;
  itemsSupplied: number;
  vendorPOs: PurchaseOrder[];
  vendorItems: {
    id: string;
    name: string;
    stockQuantity: number;
    unit: string;
    cost: number;
  }[];
  closeSignal: number;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCreatePO: () => void;
}> = ({
  vendor,
  itemsSupplied,
  vendorPOs,
  vendorItems,
  closeSignal,
  onClose,
  onEdit,
  onDelete,
  onCreatePO,
}) => {
  const router = useRouter();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [activeTab, setActiveTab] = useState<"po" | "items">("po");
  const initial = (vendor.name || "?")[0].toUpperCase();
  const slideAnim = useRef(new Animated.Value(-600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const isClosingRef = useRef(false);
  const lastCloseSignalRef = useRef(closeSignal);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -600,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      isClosingRef.current = false;
      onClose();
    });
  };

  useEffect(() => {
    // Only react to new close requests, not the initial prop value on mount.
    if (closeSignal !== lastCloseSignalRef.current) {
      lastCloseSignalRef.current = closeSignal;
      handleClose();
    }
  }, [closeSignal]);

  const handleEdit = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -600,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onEdit());
  };

  const handleDelete = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -600,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => onDelete());
  };

  const totalSpend = vendorPOs
    .filter((po) => po.status === "Paid")
    .reduce(
      (sum, po) =>
        sum + po.items.reduce((acc, i) => acc + i.cost * i.quantity, 0),
      0,
    );
  const avgOrder =
    vendorPOs.length > 0
      ? vendorPOs.reduce(
          (sum, po) =>
            sum + po.items.reduce((acc, i) => acc + i.cost * i.quantity, 0),
          0,
        ) / vendorPOs.length
      : 0;

  const measuredHeaderHeight = getHeaderHeight();
  const headerHeight = measuredHeaderHeight > 0 ? measuredHeaderHeight : 56;
  return (
    <Portal name="vendor-sidebar">
      <Animated.View
        style={{
          position: "absolute",
          top: headerHeight,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.45)",
          opacity: fadeAnim,
        }}
        pointerEvents="box-none"
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleClose}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            right: 0,
            flexDirection: "row",
            transform: [{ translateX: slideAnim }],
          }}
        >
          {/* ── LEFT PANEL ── */}
          <View
            style={{
              width: "30%",
              backgroundColor: colors.panel,
              borderRightWidth: 1,
              borderRightColor: colors.border,
            }}
          >
            <View
              style={{
                paddingHorizontal: s(14),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  letterSpacing: 0.8,
                }}
              >
                VENDOR PROFILE
              </Text>
            </View>

            <View style={{ flex: 1, padding: s(14) }}>
              {/* Avatar + Name */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(10),
                  marginBottom: s(16),
                }}
              >
                <View
                  style={{
                    width: s(48),
                    height: s(48),
                    borderRadius: s(13),
                    backgroundColor: colors.teal + "25",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1.5,
                    borderColor: colors.teal + "40",
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(20),
                      fontWeight: "800",
                      color: colors.teal,
                    }}
                  >
                    {initial}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={2}
                    style={{
                      fontSize: s(15),
                      fontWeight: "800",
                      color: colors.heading,
                      lineHeight: s(19),
                      marginBottom: s(4),
                    }}
                  >
                    {vendor.name}
                  </Text>
                  <View
                    style={{
                      alignSelf: "flex-start",
                      backgroundColor: colors.teal + "20",
                      borderRadius: s(5),
                      paddingHorizontal: s(7),
                      paddingVertical: s(2),
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(9),
                        fontWeight: "700",
                        color: colors.teal,
                      }}
                    >
                      Active
                    </Text>
                  </View>
                </View>
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginBottom: s(14),
                }}
              />

              {/* Contact Fields */}
              <View style={{ gap: s(12), marginBottom: s(16) }}>
                {vendor.contactName ? (
                  <View>
                    <Text
                      style={{
                        fontSize: s(8),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 1,
                        marginBottom: s(3),
                      }}
                    >
                      CONTACT PERSON
                    </Text>
                    <Text style={{ fontSize: s(12), color: colors.label }}>
                      {vendor.contactName}
                    </Text>
                  </View>
                ) : null}
                {vendor.email ? (
                  <View>
                    <Text
                      style={{
                        fontSize: s(8),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 1,
                        marginBottom: s(3),
                      }}
                    >
                      EMAIL
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={{ fontSize: s(12), color: colors.teal }}
                    >
                      {vendor.email}
                    </Text>
                  </View>
                ) : null}
                {vendor.phone ? (
                  <View>
                    <Text
                      style={{
                        fontSize: s(8),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 1,
                        marginBottom: s(3),
                      }}
                    >
                      PHONE
                    </Text>
                    <Text style={{ fontSize: s(12), color: colors.label }}>
                      {vendor.phone}
                    </Text>
                  </View>
                ) : null}
                {vendor.address ? (
                  <View>
                    <Text
                      style={{
                        fontSize: s(8),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 1,
                        marginBottom: s(3),
                      }}
                    >
                      ADDRESS
                    </Text>
                    <Text
                      numberOfLines={3}
                      style={{
                        fontSize: s(12),
                        color: colors.label,
                        lineHeight: s(17),
                      }}
                    >
                      {vendor.address}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View
                style={{
                  height: 1,
                  backgroundColor: colors.border,
                  marginBottom: s(14),
                }}
              />

              {/* Stats 2x2 */}
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: s(8),
                  marginBottom: s(14),
                }}
              >
                {[
                  { label: "TOTAL POS", value: String(vendorPOs.length) },
                  { label: "ITEMS SUPPLIED", value: String(itemsSupplied) },
                  {
                    label: "TOTAL SPEND",
                    value: `$${totalSpend.toFixed(0)}`,
                    highlight: true,
                  },
                  { label: "AVG ORDER", value: `$${avgOrder.toFixed(0)}` },
                ].map((stat) => (
                  <View
                    key={stat.label}
                    style={{
                      width: "47%",
                      backgroundColor: colors.screen,
                      borderRadius: s(10),
                      padding: s(10),
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(8),
                        fontWeight: "700",
                        color: colors.muted,
                        marginBottom: s(6),
                        letterSpacing: 0.5,
                      }}
                    >
                      {stat.label}
                    </Text>
                    <Text
                      style={{
                        fontSize: s(17),
                        fontWeight: "800",
                        color: stat.highlight ? colors.teal : colors.heading,
                      }}
                    >
                      {stat.value}
                    </Text>
                  </View>
                ))}
              </View>

              {vendor.description ? (
                <View>
                  <Text
                    style={{
                      fontSize: s(8),
                      fontWeight: "700",
                      color: colors.muted,
                      letterSpacing: 1,
                      marginBottom: s(6),
                    }}
                  >
                    NOTES
                  </Text>
                  <Text
                    style={{
                      fontSize: s(11),
                      color: colors.label,
                      lineHeight: s(16),
                    }}
                  >
                    {vendor.description}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Bottom Buttons */}
            <View
              style={{
                padding: s(14),
                gap: s(8),
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <TouchableOpacity
                onPress={handleEdit}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(7),
                  paddingVertical: s(10),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: s(9),
                }}
              >
                <Edit size={s(14)} color={colors.teal} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  Edit Vendor
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDelete}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: s(7),
                  paddingVertical: s(10),
                  backgroundColor: colors.danger + "15",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                  borderRadius: s(9),
                }}
              >
                <Trash2 size={s(14)} color={colors.danger} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: colors.danger,
                  }}
                >
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── RIGHT PANEL ── */}
          <View style={{ flex: 1, backgroundColor: colors.screen }}>
            {/* Right Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: s(16),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              {/* Tabs */}
              <View
                style={{
                  flexDirection: "row",
                  gap: s(4),
                  backgroundColor: colors.panel,
                  borderRadius: s(9),
                  padding: s(3),
                }}
              >
                {(["po", "items"] as const).map((tab) => (
                  <TouchableOpacity
                    key={tab}
                    onPress={() => setActiveTab(tab)}
                    style={{
                      paddingHorizontal: s(14),
                      paddingVertical: s(6),
                      borderRadius: s(7),
                      backgroundColor:
                        activeTab === tab ? colors.teal : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "700",
                        color:
                          activeTab === tab ? colors.onSolid : colors.muted,
                      }}
                    >
                      {tab === "po" ? "Purchase Orders" : "Associated Items"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                onPress={onCreatePO}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                  paddingHorizontal: s(12),
                  paddingVertical: s(8),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  borderRadius: s(8),
                }}
              >
                <Plus size={s(13)} color={colors.teal} />
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: "700",
                    color: colors.teal,
                  }}
                >
                  Create PO
                </Text>
              </TouchableOpacity>
            </View>

            {/* PO Tab */}
            {activeTab === "po" && (
              <View style={{ flex: 1 }}>
                {/* Table Header */}
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: s(16),
                    paddingVertical: s(10),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  {["PO #", "DATE", "STATUS", "ITEMS", "TOTAL"].map((h, i) => (
                    <Text
                      key={h}
                      style={{
                        flex: i === 0 ? 1.2 : 1,
                        fontSize: s(9),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 0.8,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                  <View style={{ width: s(30) }} />
                </View>

                <FlatList
                  data={vendorPOs}
                  keyExtractor={(po) => po.id}
                  renderItem={({ item: po }) => {
                    const poTotal = po.items.reduce(
                      (acc, i) => acc + i.cost * i.quantity,
                      0,
                    );
                    const statusColor =
                      STATUS_COLORS[po.status] ?? colors.muted;
                    const dateStr = new Date(po.createdAt).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    );
                    return (
                      <TouchableOpacity
                        onPress={() =>
                          router.push(`/inventory/purchase-orders/${po.id}`)
                        }
                        activeOpacity={0.7}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: s(16),
                          paddingVertical: s(12),
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            flex: 1.2,
                            fontSize: s(12),
                            fontWeight: "700",
                            color: colors.teal,
                          }}
                        >
                          {po.poNumber}
                        </Text>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: s(12),
                            color: colors.label,
                          }}
                        >
                          {dateStr}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              alignSelf: "flex-start",
                              backgroundColor: statusColor + "25",
                              borderRadius: s(6),
                              paddingHorizontal: s(8),
                              paddingVertical: s(3),
                            }}
                          >
                            <Text
                              style={{
                                fontSize: s(10),
                                fontWeight: "700",
                                color: statusColor,
                              }}
                            >
                              {po.status}
                            </Text>
                          </View>
                        </View>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: s(12),
                            color: colors.label,
                          }}
                        >
                          {po.items.length} items
                        </Text>
                        <Text
                          style={{
                            flex: 1,
                            fontSize: s(12),
                            fontWeight: "700",
                            color: colors.heading,
                          }}
                        >
                          ${poTotal.toFixed(2)}
                        </Text>
                        <View style={{ width: s(30) }} />
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={
                    <View
                      style={{ alignItems: "center", paddingVertical: s(48) }}
                    >
                      <Text style={{ fontSize: s(13), color: colors.muted }}>
                        No purchase orders yet
                      </Text>
                    </View>
                  }
                />
              </View>
            )}

            {/* Items Tab */}
            {activeTab === "items" && (
              <View style={{ flex: 1 }}>
                <View
                  style={{
                    flexDirection: "row",
                    paddingHorizontal: s(16),
                    paddingVertical: s(10),
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                  }}
                >
                  {["ITEM NAME", "STOCK", "UNIT", "COST"].map((h) => (
                    <Text
                      key={h}
                      style={{
                        flex: 1,
                        fontSize: s(9),
                        fontWeight: "700",
                        color: colors.muted,
                        letterSpacing: 0.8,
                      }}
                    >
                      {h}
                    </Text>
                  ))}
                </View>
                <FlatList
                  data={vendorItems}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: s(16),
                        paddingVertical: s(12),
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                      }}
                    >
                      <Text
                        style={{
                          flex: 1,
                          fontSize: s(12),
                          fontWeight: "600",
                          color: colors.heading,
                        }}
                      >
                        {item.name}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: s(12),
                          color: colors.label,
                        }}
                      >
                        {item.stockQuantity}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: s(12),
                          color: colors.label,
                        }}
                      >
                        {item.unit}
                      </Text>
                      <Text
                        style={{
                          flex: 1,
                          fontSize: s(12),
                          color: colors.label,
                        }}
                      >
                        ${item.cost.toFixed(2)}
                      </Text>
                    </View>
                  )}
                  ListEmptyComponent={
                    <View
                      style={{ alignItems: "center", paddingVertical: s(48) }}
                    >
                      <Text style={{ fontSize: s(13), color: colors.muted }}>
                        No items associated
                      </Text>
                    </View>
                  }
                />
              </View>
            )}
          </View>
        </Animated.View>
      </Animated.View>
    </Portal>
  );
};

const VendorCard: React.FC<{
  item: Vendor;
  onEdit: () => void;
  onDelete: () => void;
  onTap: () => void;
}> = ({ item, onEdit, onDelete, onTap }) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <TouchableOpacity
      onPress={onTap}
      activeOpacity={0.6}
      style={{
        backgroundColor: colors.panel,
        margin: s(5),
        borderRadius: s(14),
        padding: s(11),
        borderWidth: 1,
        borderColor: colors.border,
        flex: 1,
        justifyContent: "space-between",
        overflow: "hidden",
      }}
    >
      {/* Gradient Accent Top */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          backgroundColor: colors.teal,
        }}
      />

      {/* Icon & Menu */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: s(8),
        }}
      >
        <View
          style={{
            width: s(32),
            height: s(32),
            borderRadius: s(10),
            backgroundColor: colors.teal + "15",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Building2 size={s(15)} color={colors.teal} />
        </View>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity
              style={{
                width: s(28),
                height: s(28),
                borderRadius: s(9),
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <MoreHorizontal size={s(12)} color={colors.muted} />
            </TouchableOpacity>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-44"
            style={{
              backgroundColor: colors.card,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: s(14),
              padding: s(6),
              shadowColor: "#000",
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 12,
            }}
          >
            <DropdownMenuItem
              onPress={onEdit}
              className="active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent"
              style={{
                borderRadius: s(10),
                paddingHorizontal: s(10),
                paddingVertical: s(9),
                backgroundColor: colors.card,
              }}
            >
              <Edit size={s(14)} color={colors.label} />
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "600",
                  color: colors.heading,
                  marginLeft: s(8),
                }}
              >
                Edit
              </Text>
            </DropdownMenuItem>

            <DropdownMenuItem
              onPress={onDelete}
              className="active:bg-transparent web:hover:bg-transparent web:focus:bg-transparent"
              style={{
                borderRadius: s(10),
                paddingHorizontal: s(10),
                paddingVertical: s(9),
                backgroundColor: colors.card,
              }}
            >
              <Trash2 size={s(14)} color={colors.danger} />
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "600",
                  color: colors.danger,
                  marginLeft: s(8),
                }}
              >
                Delete
              </Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>

      {/* Name */}
      <Text
        numberOfLines={2}
        style={{
          fontSize: s(11),
          fontWeight: "700",
          color: colors.heading,
          marginBottom: s(8),
          lineHeight: s(14),
        }}
      >
        {item.name}
      </Text>

      {/* Contact Info with Better Spacing */}
      <View style={{ gap: s(5) }}>
        {item.contactName && (
          <View
            style={{
              flexDirection: "row",
              gap: s(4),
              alignItems: "flex-start",
            }}
          >
            <View style={{ marginTop: s(2) }}>
              <User size={s(10)} color={colors.muted} />
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: s(10), color: colors.label, flex: 1 }}
            >
              {item.contactName}
            </Text>
          </View>
        )}

        {item.email && (
          <View
            style={{
              flexDirection: "row",
              gap: s(4),
              alignItems: "flex-start",
            }}
          >
            <View style={{ marginTop: s(2) }}>
              <Mail size={s(10)} color={colors.muted} />
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: s(10), color: colors.label, flex: 1 }}
            >
              {item.email}
            </Text>
          </View>
        )}

        {item.phone && (
          <View
            style={{
              flexDirection: "row",
              gap: s(4),
              alignItems: "flex-start",
            }}
          >
            <View style={{ marginTop: s(2) }}>
              <Phone size={s(10)} color={colors.muted} />
            </View>
            <Text
              numberOfLines={1}
              style={{ fontSize: s(10), color: colors.label, flex: 1 }}
            >
              {item.phone}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const VendorScreen = () => {
  const {
    vendors,
    addVendor,
    updateVendor,
    deleteVendor,
    fetchVendors,
    inventoryItems,
    purchaseOrders,
  } = useInventoryStore();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const merchantId = selectedStore?.merchant_id ?? "";

  const locationId = selectedStore?.id ?? "";

  useEffect(() => {
    if (locationId) fetchVendors(locationId);
  }, [locationId]);
  const router = useRouter();

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarVendor, setSidebarVendor] = useState<Vendor | null>(null);
  const [isSidebarClosing, setIsSidebarClosing] = useState(false);
  const [closeSignal, setCloseSignal] = useState(0);
  const [poModuleVendor, setPoModuleVendor] = useState<Vendor | null>(null);
  const [poModuleOpenSignal, setPoModuleOpenSignal] = useState(0);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["70%", "95%"], []);

  const openSidebar = (vendor: Vendor) => {
    setIsSidebarClosing(false);
    setSidebarVendor(vendor);
    setActiveVendorSidebarId(vendor.id);
  };

  const closeSidebar = () => {
    if (sidebarVendor && !isSidebarClosing) {
      setIsSidebarClosing(true);
      setCloseSignal((s) => s + 1);
    }
  };

  useEffect(() => {
    registerVendorSidebarCloseHandler(() => {
      if (sidebarVendor && !isSidebarClosing) {
        setIsSidebarClosing(true);
        setCloseSignal((s) => s + 1);
      }
    });

    return () => registerVendorSidebarCloseHandler(null);
  }, [sidebarVendor, isSidebarClosing]);

  useEffect(() => {
    return () => setActiveVendorSidebarId(null);
  }, []);

  const filteredVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.contactName, v.email, v.phone]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(q)),
    );
  }, [searchQuery, vendors]);

  const groupedVendors = useMemo(() => {
    const map: Record<string, Vendor[]> = {};
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

  const handleOpenAddModal = () => {
    setSelectedVendor(null);
    setModalMode("add");
  };

  const handleOpenEditModal = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setModalMode("edit");
  };

  const handleCloseModal = () => {
    setModalMode(null);
    setSelectedVendor(null);
  };

  const handleSaveVendor = (data: Omit<Vendor, "id">, id?: string) => {
    if (id) {
      updateVendor(id, data);
    } else {
      addVendor(data, merchantId, locationId);
    }
  };

  const handleOpenDeleteConfirm = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = () => {
    if (selectedVendor) {
      deleteVendor(selectedVendor.id);
    }
    setDeleteConfirmOpen(false);
    setSelectedVendor(null);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header with Search & Add */}
      <View
        style={{
          flexDirection: "row",
          marginHorizontal: 10,
          marginBottom: 8,
          marginTop: 10,
          gap: 8,
        }}
      >
        <TouchableOpacity
          onPress={() => {
            setTimeout(() => sheetRef.current?.expand(), 0);
          }}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.panel,
            borderRadius: 8,
            paddingHorizontal: 10,
            height: 40,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <Search size={14} color={colors.muted} />
          <Text
            style={{
              marginLeft: 6,
              fontSize: 13,
              color: colors.muted,
              flex: 1,
            }}
          >
            Search vendors...
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleOpenAddModal}
          style={{
            height: 40,
            width: 40,
            borderRadius: 8,
            backgroundColor: colors.teal + "20",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Plus size={18} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <FlatList
        data={vendors}
        keyExtractor={(item) => item.id}
        numColumns={5}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <VendorCard
            item={item}
            onTap={() => openSidebar(item)}
            onEdit={() => handleOpenEditModal(item)}
            onDelete={() => handleOpenDeleteConfirm(item)}
          />
        )}
        ListEmptyComponent={
          <View
            style={{
              alignItems: "center",
              paddingVertical: 48,
              gap: 8,
              width: "100%",
            }}
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
              <Building2 size={20} color={colors.teal} />
            </View>
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: colors.heading }}
            >
              No vendors yet
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted }}>
              Add your first vendor to get started
            </Text>
          </View>
        }
      />

      <VendorFormModal
        isOpen={modalMode === "add" || modalMode === "edit"}
        onClose={handleCloseModal}
        onSave={handleSaveVendor}
        initialData={selectedVendor}
      />

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Vendor"
        description={`Are you sure you want to permanently delete "${selectedVendor?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />

      {/* Search Bottom Sheet */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
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
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              padding: 12,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
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
                height: 40,
                gap: 8,
              }}
            >
              <Search size={15} color={colors.muted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search vendors..."
                placeholderTextColor={colors.muted}
                style={{ flex: 1, fontSize: 14, color: colors.heading }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
        <BottomSheetSectionList
          sections={groupedVendors}
          keyExtractor={(item) => item.id}
          renderSectionHeader={({ section }) => (
            <View
              style={{
                paddingVertical: 4,
                paddingHorizontal: 12,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                marginBottom: 4,
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
            <TouchableOpacity
              onPress={() => {
                sheetRef.current?.close();
                router.push(`/inventory/vendors/${item.id}`);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: colors.teal + "15",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Building2 size={15} color={colors.teal} />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "600",
                    color: colors.heading,
                  }}
                >
                  {item.name}
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                >
                  {item.contactName} · {item.phone}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.muted }}>
                {item.email}
              </Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: colors.muted }}>
                No vendors found
              </Text>
            </View>
          }
        />
      </BottomSheet>

      {/* Vendor Sidebar */}
      {sidebarVendor && (
        <VendorSidebar
          vendor={sidebarVendor}
          itemsSupplied={
            inventoryItems.filter((i) => i.vendorId === sidebarVendor.id).length
          }
          vendorPOs={purchaseOrders.filter(
            (po) => po.vendorId === sidebarVendor.id,
          )}
          vendorItems={inventoryItems
            .filter((i) => i.vendorId === sidebarVendor.id)
            .map((i) => ({
              id: i.id,
              name: i.name,
              stockQuantity: i.stockQuantity,
              unit: i.unit,
              cost: i.cost,
            }))}
          closeSignal={closeSignal}
          onClose={() => {
            setSidebarVendor(null);
            setIsSidebarClosing(false);
            setActiveVendorSidebarId(null);
          }}
          onEdit={() => {
            setSidebarVendor(null);
            setIsSidebarClosing(false);
            setActiveVendorSidebarId(null);
            handleOpenEditModal(sidebarVendor);
          }}
          onDelete={() => {
            setSidebarVendor(null);
            setIsSidebarClosing(false);
            setActiveVendorSidebarId(null);
            handleOpenDeleteConfirm(sidebarVendor);
          }}
          onCreatePO={() => {
            setPoModuleVendor(sidebarVendor);
            setPoModuleOpenSignal((s) => s + 1);
          }}
        />
      )}

      {poModuleVendor && (
        <VendorCreatePOModule
          vendorId={poModuleVendor.id}
          vendorName={poModuleVendor.name}
          vendorPOs={purchaseOrders.filter(
            (po) => po.vendorId === poModuleVendor.id,
          )}
          items={inventoryItems}
          resolveItemName={(id: string) => {
            const item = inventoryItems.find((i) => i.id === id);
            return item?.name || "Item";
          }}
          openSignal={poModuleOpenSignal}
        />
      )}
    </View>
  );
};

export default VendorScreen;
