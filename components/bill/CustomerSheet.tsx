import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { isValidUUID } from "@/lib/offlineIdRegistry";
import {
    createCustomerOffline,
    createCustomerOnline,
    fetchAndCacheCustomers,
    getCachedCustomers,
    linkCustomerToOrder,
    processCustomerQueue,
} from "@/services/customer";
import { getIsOnline } from "@/services/offlineSyncService";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CustomerWithMeta } from "@/types/customer";
import { ArrowLeft, Search, X } from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    SectionList,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";
import { colors } from "@/lib/theme";

export const formatAddress = (address: string | null | undefined) => {
  if (!address) return "";
  try {
    const parsed = JSON.parse(address);
    if (parsed && typeof parsed === "object") {
      const parts = [
        parsed.street,
        parsed.city,
        parsed.state,
        parsed.zip,
      ].filter(Boolean);
      return parts.join(", ");
    }
    return address;
  } catch {
    return address;
  }
};

const CustomerSheet: React.FC = () => {
  const { isOpen, closeSheet } = useCustomerSheetStore();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const order = useActiveOrder();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();

  const [viewMode, setViewMode] = useState<"search" | "add">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");
  const [customers, setCustomers] = useState<CustomerWithMeta[]>([]);
  const isAssignDisabled = !activeOrderId;

  const storeRef = useRef({ selectedStore, supabase });
  storeRef.current = { selectedStore, supabase };

  const refreshCustomers = useCallback(async () => {
    setCustomers(getCachedCustomers());

    const { selectedStore: store, supabase: client } = storeRef.current;

    if (store && getIsOnline()) {
      try {
        const updated = await fetchAndCacheCustomers(client, store.merchant_id);
        setCustomers(updated);
        await processCustomerQueue(client);
      } catch (err) {
        console.warn("Failed to refresh customers:", err);
      }
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshCustomers();
      setViewMode("search");
      setSearchQuery("");
      clearForm();
    }
  }, [isOpen, refreshCustomers]);

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const list = !query
      ? customers
      : customers.filter((c: CustomerWithMeta) => {
          const nameMatch = (c.name || "").toLowerCase().includes(query);
          const phoneRaw = (c.phone ?? c.phoneNumber ?? "").toLowerCase();
          const phoneMatch = phoneRaw.includes(query);
          const addressMatch = (c.address || "").toLowerCase().includes(query);
          return nameMatch || phoneMatch || addressMatch;
        });
    return list;
  }, [searchQuery, customers]);

  const topCustomers = useMemo(() => {
    return [...customers]
      .filter((c) => (c.total_orders ?? 0) > 0)
      .sort((a, b) => (b.total_orders ?? 0) - (a.total_orders ?? 0))
      .slice(0, 3);
  }, [customers]);

  const groupedCustomers = useMemo(() => {
    const map: Record<string, CustomerWithMeta[]> = {};
    for (const c of filteredCustomers) {
      const first = (c.name || "?")[0].toUpperCase();
      const key = /[A-Z]/.test(first) ? first : "#";
      if (!map[key]) map[key] = [];
      map[key].push(c);
    }
    const letters = Object.keys(map).sort((a, b) => {
      if (a === "#") return 1;
      if (b === "#") return -1;
      return a.localeCompare(b);
    });
    return letters.map((letter) => ({ title: letter, data: map[letter] }));
  }, [filteredCustomers]);

  const handleSelectCustomer = async (customer: CustomerWithMeta) => {
    if (!activeOrderId) return;
    if (!selectedStore) {
      show({
        title: "No Store Selected",
        message: "Please select a store before assigning a customer.",
        type: "error",
      });
      return;
    }

    const displayAddress = formatAddress(customer.address);

    updateActiveOrderDetails({
      customer_name: customer.name || "",
      customer_phone: customer.phone ?? customer.phoneNumber ?? "",
      customer_email: customer.email || "",
      delivery_address: displayAddress,
      customer_id: customer.id,
    });

    // Close immediately — optimistic update already applied
    handleClose();

    const sanitizedDbOrderId =
      order?.db_order_id && isValidUUID(order.db_order_id)
        ? order.db_order_id
        : null;

    try {
      await linkCustomerToOrder(supabase, {
        orderId: activeOrderId,
        dbOrderId: sanitizedDbOrderId,
        customerId: customer.id,
        merchantId: selectedStore.merchant_id,
      });

      show({
        title: customer.is_offline ? "Customer Queued" : "Customer Assigned",
        message: customer.is_offline
          ? `${customer.name || "Customer"} will sync when online.`
          : `${customer.name || "Customer"} has been assigned to the order.`,
        type: customer.is_offline ? "warning" : "success",
      });
    } catch (error: any) {
      show({
        title: "Could Not Assign Customer",
        message: error.message || "An unexpected error occurred.",
        type: "error",
      });
    }
  };

  const handlePhoneChange = (text: string) => {
    const cleaned = text.replace(/\D/g, "");
    let formatted = cleaned;
    if (cleaned.length > 6) {
      formatted = `(${cleaned.slice(0, 3)}) - ${cleaned.slice(3, 6)} - ${cleaned.slice(6, 10)}`;
    } else if (cleaned.length > 3) {
      formatted = `(${cleaned.slice(0, 3)}) - ${cleaned.slice(3)}`;
    } else if (cleaned.length > 0) {
      formatted = `(${cleaned}`;
    }
    setNewPhone(formatted);
  };

  const handleSaveNewCustomer = async () => {
    const rawPhone = newPhone.replace(/\D/g, "");
    if (!newName.trim() || rawPhone.length < 10) {
      show({
        title: "Missing Information",
        message: "Please enter a valid name and a 10-digit phone number.",
        type: "error",
      });
      return;
    }

    if (!selectedStore) {
      show({
        title: "No Store Selected",
        message: "Please select a store before adding a customer.",
        type: "error",
      });
      return;
    }

    const addressObj = {
      street: street.trim(),
      city: city.trim(),
      state: stateCode.trim(),
      zip: zip.trim(),
    };
    const hasAddress = Object.values(addressObj).some((val) => val.length > 0);
    const addressString = hasAddress ? JSON.stringify(addressObj) : "";

    const online = getIsOnline();

    try {
      const newCustomer = online
        ? await createCustomerOnline(supabase, {
            merchantId: selectedStore.merchant_id,
            name: newName.trim(),
            phone: newPhone.trim(),
            address: addressString,
          })
        : createCustomerOffline({
            merchantId: selectedStore.merchant_id,
            name: newName.trim(),
            phone: newPhone.trim(),
            address: addressString,
          });

      setCustomers(getCachedCustomers());
      await handleSelectCustomer(newCustomer);
    } catch (error: any) {
      show({
        title: "Could Not Add Customer",
        message: error.message,
        type: "error",
      });
    }
  };

  const clearForm = () => {
    setNewName("");
    setNewPhone("");
    setStreet("");
    setCity("");
    setStateCode("");
    setZip("");
  };

  const handleClose = () => {
    closeSheet();
    clearForm();
    setViewMode("search");
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "rgba(0,0,0,0.5)" }}>
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={{
                width: 480,
                height: "80%",
                backgroundColor: colors.screen,
                borderRadius: 16,
                overflow: "hidden",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {/* Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {viewMode === "add" && (
                    <TouchableOpacity onPress={() => setViewMode("search")}>
                      <ArrowLeft color={colors.label} size={16} />
                    </TouchableOpacity>
                  )}
                  <Text style={{ color: colors.heading, fontSize: 13, fontWeight: "700" }}>
                    {viewMode === "search" ? "Assign Customer" : "Add Customer"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  {viewMode === "search" && (
                    <TouchableOpacity
                      disabled={isAssignDisabled}
                      onPress={() => setViewMode("add")}
                      style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: isAssignDisabled ? colors.teal + "40" : colors.teal + "18", borderWidth: 1, borderColor: isAssignDisabled ? colors.teal + "30" : colors.teal + "50" }}
                    >
                      <Text style={{ color: isAssignDisabled ? colors.muted : colors.teal, fontSize: 12, fontWeight: "600" }}>+ New</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity onPress={handleClose} style={{ padding: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
                    <X color={colors.label} size={14} />
                  </TouchableOpacity>
                </View>
              </View>

              {viewMode === "search" ? (
                <View style={{ flex: 1 }}>
                  <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, backgroundColor: colors.card, borderColor: colors.border }}>
                      <Search size={13} color={colors.muted} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search name, phone, address..."
                        placeholderTextColor={colors.muted}
                        style={{ flex: 1, marginLeft: 8, color: colors.heading, fontSize: 12, padding: 0 }}
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                          <X size={13} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Top customers quick-pick */}
                  {topCustomers.length > 0 && !searchQuery && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                      <Text style={{ fontSize: 9, color: colors.muted, fontWeight: '600', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>Frequent</Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {topCustomers.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            disabled={isAssignDisabled}
                            onPress={() => handleSelectCustomer(c)}
                            style={{
                              flex: 1,
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 6,
                              paddingHorizontal: 10,
                              paddingVertical: 8,
                              borderRadius: 8,
                              backgroundColor: colors.teal + '10',
                              borderWidth: 1,
                              borderColor: colors.teal + '30',
                              opacity: isAssignDisabled ? 0.6 : 1,
                            }}
                          >
                            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '20' }}>
                              <Text style={{ color: colors.teal, fontSize: 10, fontWeight: '700' }}>{(c.name || '?')[0].toUpperCase()}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ color: colors.heading, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>{c.name}</Text>
                              <Text style={{ color: colors.muted, fontSize: 9 }}>{c.total_orders} orders</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <SectionList
                    sections={groupedCustomers}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20 }}
                    renderSectionHeader={({ section }) => (
                      <View style={{ paddingVertical: 4, paddingHorizontal: 4, marginBottom: 4, marginTop: 8, borderBottomWidth: 1, borderColor: colors.border }}>
                        <Text style={{ color: colors.teal, fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>{section.title}</Text>
                      </View>
                    )}
                    renderItem={({ item }: { item: CustomerWithMeta }) => (
                      <TouchableOpacity
                        disabled={isAssignDisabled}
                        onPress={() => handleSelectCustomer(item)}
                        style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8, borderWidth: 1, marginBottom: 6, backgroundColor: colors.card, borderColor: colors.border, opacity: isAssignDisabled ? 0.6 : 1 }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", marginRight: 10, backgroundColor: colors.teal + "20" }}>
                          <Text style={{ color: colors.teal, fontSize: 12, fontWeight: "700" }}>
                            {(item.name || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.heading, fontSize: 12, fontWeight: "600" }}>{item.name || "Unknown"}</Text>
                          <Text style={{ color: colors.label, fontSize: 11, marginTop: 1 }}>{item.phone ?? item.phoneNumber}</Text>
                          {item.address ? (
                            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>{formatAddress(item.address)}</Text>
                          ) : null}
                        </View>
                        {item.is_offline && (
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.warning + "20", borderWidth: 1, borderColor: colors.warning + "40" }}>
                            <Text style={{ color: colors.warning, fontSize: 11 }}>Offline</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    )}
                    ListEmptyComponent={
                      <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center", paddingVertical: 32 }}>No customers found.</Text>
                    }
                  />
                </View>
              ) : (
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                  <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>Address fields are optional.</Text>

                    <View style={{ gap: 5 }}>
                      <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Full Name *</Text>
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        placeholder="e.g. John Doe"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }}
                      />
                    </View>

                    <View style={{ gap: 5 }}>
                      <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Phone Number *</Text>
                      <TextInput
                        value={newPhone}
                        onChangeText={handlePhoneChange}
                        placeholder="(555) - 555 - 5555"
                        maxLength={20}
                        keyboardType="phone-pad"
                        placeholderTextColor={colors.muted}
                        style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.teal + "60", borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }}
                      />
                    </View>

                    <View style={{ gap: 5 }}>
                      <Text style={{ color: colors.label, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8 }}>Delivery Address</Text>
                      <TextInput value={street} onChangeText={setStreet} placeholder="Street Address" placeholderTextColor={colors.muted} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }} />
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TextInput value={city} onChangeText={setCity} placeholder="City" placeholderTextColor={colors.muted} style={{ flex: 2, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }} />
                        <TextInput value={stateCode} onChangeText={setStateCode} placeholder="State" placeholderTextColor={colors.muted} style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }} />
                      </View>
                      <TextInput value={zip} onChangeText={setZip} placeholder="Zip Code" keyboardType="numeric" placeholderTextColor={colors.muted} style={{ width: "50%", backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 8, height: 38, paddingHorizontal: 12, color: colors.heading, fontSize: 13 }} />
                    </View>

                    <TouchableOpacity onPress={handleSaveNewCustomer} style={{ borderRadius: 8, height: 38, alignItems: "center", justifyContent: "center", marginTop: 4, backgroundColor: colors.teal + "18", borderWidth: 1, borderColor: colors.teal + "50" }}>
                      <Text style={{ color: colors.teal, fontSize: 13, fontWeight: "700" }}>Save Customer</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </KeyboardAvoidingView>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default CustomerSheet;
