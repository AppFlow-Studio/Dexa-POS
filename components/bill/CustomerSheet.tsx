import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { isValidUUID } from "@/lib/offlineIdRegistry";
import { useIsActiveOrderReadOnly } from "@/lib/orderAccessControlHooks";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useCustomerDirectory } from "@/hooks/customers/useCustomerDirectory";
import {
    createCustomerOffline,
    createCustomerOnline,
    fetchAndCacheCustomers,
    linkCustomerToOrder,
    loadTopCustomers,
    processCustomerQueue,
    updateCustomerInfo,
} from "@/services/customer";
import { FlashList } from "@shopify/flash-list";
import { getIsOnline } from "@/services/offlineSyncService";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { CustomerWithMeta } from "@/types/customer";
import { formatAddress, parseAddressString } from "@/utils/addressUtils";
import { ArrowLeft, Search, X } from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Keyboard,
    Modal,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from "react-native";

export { formatAddress } from "@/utils/addressUtils";

const CustomerSheet: React.FC = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const { isOpen, closeSheet } = useCustomerSheetStore();
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const updateActiveOrderDetails = useOrderStore(
    (s) => s.updateActiveOrderDetails,
  );
  const order = useActiveOrder();
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();

  const [viewMode, setViewMode] = useState<"search" | "add" | "edit">("search");
  const isForm = viewMode === "add" || viewMode === "edit";
  const [editingCustomer, setEditingCustomer] =
    useState<CustomerWithMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [isNameFocused, setIsNameFocused] = useState(false);
  const [isPhoneFocused, setIsPhoneFocused] = useState(false);
  const [isAddressFocused, setIsAddressFocused] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [stateCode, setStateCode] = useState("");
  const [zip, setZip] = useState("");
  const [addressDisplay, setAddressDisplay] = useState("");
  // Phase 5: the directory comes from the SQLite mirror (5,000 rows) rather
  // than the 200-row MMKV cache, narrowed server-side by the search box. The
  // client-side `filteredCustomers` below still runs, unchanged — this is a
  // SUPERSET of what it matches on. See hooks/customers/useCustomerDirectory.
  const { customers, reload: reloadDirectory } = useCustomerDirectory(
    searchQuery,
    { enabled: isOpen },
  );
  const [topCustomers, setTopCustomers] = useState<CustomerWithMeta[]>([]);
  // Wave 2.2: defense-in-depth — block customer assignment when the active
  // order is owned by another station. Server-side enforcement lands in
  // Wave 2.4 via `update_order_details_v1`; this UI gate prevents the
  // optimistic local update + post-attempt error toast.
  const isReadOnlyForStation = useIsActiveOrderReadOnly();
  const isAssignDisabled = !activeOrderId || isReadOnlyForStation;

  const storeRef = useRef({ selectedStore, supabase });
  storeRef.current = { selectedStore, supabase };

  const refreshCustomers = useCallback(async () => {
    const { selectedStore: store, supabase: client } = storeRef.current;

    if (store && getIsOnline()) {
      try {
        // Writes the mirror as a side effect, at the seam where the payload
        // has already arrived — one fetch, one cadence.
        await fetchAndCacheCustomers(client, store.merchant_id);
        await processCustomerQueue(client);
      } catch (err) {
        console.warn("Failed to refresh customers:", err);
      }
    }
    // Re-read after the fetch either way: offline, this still paints the
    // mirror, which is the whole point.
    reloadDirectory();
    setTopCustomers(await loadTopCustomers(3));
  }, [reloadDirectory]);

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

  /**
   * FlashList has no sections, so the A/B/C grouping is FLATTENED into one
   * array of headers and rows and told apart by `getItemType`. That is
   * FlashList's own recommended shape for sectioned data: it lets the two
   * cell kinds recycle into separate pools, so a header never gets reused as
   * a customer row (which is what produces the classic wrong-height flicker
   * when sections are faked with a single item type).
   *
   * The grouping itself is unchanged from the SectionList version.
   */
  const directoryRows = useMemo(() => {
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
    const rows: (string | CustomerWithMeta)[] = [];
    for (const letter of letters) {
      rows.push(letter);
      rows.push(...map[letter]);
    }
    return rows;
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

    // Wave 2.2: defense-in-depth ownership pre-flight. Catches any caller
    // that bypassed the disabled-button gate (deep link, programmatic).
    if (isReadOnlyForStation) {
      show({
        title: "Order owned by another station",
        message: "Claim it via Take Over before assigning a customer.",
        type: "error",
      });
      return;
    }

    updateActiveOrderDetails({
      customer_name: customer.name || "",
      customer_phone: customer.phone ?? customer.phoneNumber ?? "",
      customer_email: customer.email || "",
      delivery_address: customer.address || "",
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
    const cleaned = text.replace(/\D/g, "").slice(0, 10);
    let formatted = cleaned;
    if (cleaned.length > 6) {
      formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    } else if (cleaned.length > 3) {
      formatted = `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`;
    } else if (cleaned.length > 0) {
      formatted = `(${cleaned}`;
    }
    setNewPhone(formatted);
  };

  const handleSaveNewCustomer = async () => {
    const rawPhone = newPhone.replace(/\D/g, "");
    if (!newName.trim()) {
      show({
        title: "Missing Information",
        message: "Please enter a customer name.",
        type: "error",
      });
      return;
    }
    // Phone is optional, but if provided it must be a complete 10-digit number.
    if (rawPhone.length > 0 && rawPhone.length < 10) {
      show({
        title: "Invalid Phone Number",
        message:
          "Please enter a complete 10-digit phone number, or leave it blank.",
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

      reloadDirectory();
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
    setAddressDisplay("");
    setEditingCustomer(null);
  };

  const handleLongPressCustomer = useCallback((customer: CustomerWithMeta) => {
    setEditingCustomer(customer);
    setNewName(customer.name || "");

    // Format phone for read-only display
    const rawPhone = (customer.phone ?? customer.phoneNumber ?? "")
      .replace(/\D/g, "")
      .slice(0, 10);
    let formatted = rawPhone;
    if (rawPhone.length > 6) {
      formatted = `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3, 6)}-${rawPhone.slice(6)}`;
    } else if (rawPhone.length > 3) {
      formatted = `(${rawPhone.slice(0, 3)}) ${rawPhone.slice(3)}`;
    } else if (rawPhone.length > 0) {
      formatted = `(${rawPhone}`;
    }
    setNewPhone(formatted);

    // Parse structured address if available
    const parsed = parseAddressString(customer.address);
    if (parsed) {
      setStreet(parsed.street);
      setCity(parsed.city);
      setStateCode(parsed.state);
      setZip(parsed.zip);
      setAddressDisplay(formatAddress(customer.address));
    } else {
      setStreet(customer.address || "");
      setCity("");
      setStateCode("");
      setZip("");
      setAddressDisplay(customer.address || "");
    }
    setViewMode("edit");
  }, []);

  const handleSaveEditCustomer = async () => {
    if (!editingCustomer) return;
    if (!newName.trim()) {
      show({
        title: "Missing Name",
        message: "Customer name is required.",
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

    try {
      await updateCustomerInfo(
        editingCustomer.id,
        { name: newName.trim(), address: addressString },
        supabase,
      );
      reloadDirectory();
      show({
        title: "Customer Updated",
        message: `${newName.trim()} has been updated.`,
        type: "success",
      });
      setViewMode("search");
      clearForm();
    } catch (error: any) {
      show({
        title: "Could Not Update",
        message: error.message,
        type: "error",
      });
    }
  };

  const fieldLabelStyle = {
    color: colors.label,
    fontSize: s(10),
    fontWeight: "600" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  };

  const fieldInputStyle = {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: s(8),
    height: s(46),
    paddingHorizontal: s(12),
    color: colors.heading,
    fontSize: s(14),
    textAlignVertical: "center" as const,
    includeFontPadding: false,
    paddingTop: 0,
    paddingBottom: 0,
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
      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <View
          style={{
            flex: 1,
            // The form is top-anchored: it then does not move at all when the
            // soft keyboard opens, the keyboard simply covers empty space
            // below it. Search keeps its centered, full-height directory.
            justifyContent: isForm ? "flex-start" : "center",
            paddingTop: isForm ? s(24) : 0,
            alignItems: "center",
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        >
          <TouchableWithoutFeedback onPress={() => {}}>
            <View
              style={{
                width: s(600),
                // The form sizes to its content (~320px) so it fits inside the
                // keyboard safe zone by construction - see the two-column row
                // and conditional address field below.
                height: isForm ? undefined : "80%",
                backgroundColor: colors.screen,
                borderRadius: s(16),
                // AddressAutocomplete renders its dropdown upward
                // (dropdownPosition="top") and absolutely positioned; clipping
                // it to the now-short modal would cut off suggestions.
                overflow: isForm ? "visible" : "hidden",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: s(16),
                  paddingVertical: s(12),
                  borderBottomWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(8),
                  }}
                >
                  {(viewMode === "add" || viewMode === "edit") && (
                    <TouchableOpacity
                      onPress={() => {
                        setViewMode("search");
                        clearForm();
                      }}
                    >
                      <ArrowLeft color={colors.label} size={s(16)} />
                    </TouchableOpacity>
                  )}
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: s(13),
                      fontWeight: "700",
                    }}
                  >
                    {viewMode === "search"
                      ? "Assign Customer"
                      : viewMode === "add"
                        ? "Add Customer"
                        : "Edit Customer"}
                  </Text>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: s(8),
                    alignItems: "center",
                  }}
                >
                  {viewMode === "search" && (
                    <TouchableOpacity
                      disabled={isAssignDisabled}
                      onPress={() => setViewMode("add")}
                      style={{
                        paddingHorizontal: s(10),
                        paddingVertical: s(5),
                        borderRadius: s(8),
                        backgroundColor: isAssignDisabled
                          ? colors.teal + "40"
                          : colors.teal + "18",
                        borderWidth: 1,
                        borderColor: isAssignDisabled
                          ? colors.teal + "30"
                          : colors.teal + "50",
                      }}
                    >
                      <Text
                        style={{
                          color: isAssignDisabled ? colors.muted : colors.teal,
                          fontSize: s(12),
                          fontWeight: "600",
                        }}
                      >
                        + New
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={handleClose}
                    style={{
                      padding: s(4),
                      borderRadius: s(6),
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <X color={colors.label} size={s(14)} />
                  </TouchableOpacity>
                </View>
              </View>

              {viewMode === "search" ? (
                <View style={{ flex: 1 }}>
                  <View
                    style={{
                      paddingHorizontal: s(12),
                      paddingTop: s(12),
                      paddingBottom: s(8),
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: s(8),
                        paddingHorizontal: s(10),
                        paddingVertical: s(6),
                        borderWidth: 1,
                        backgroundColor: colors.card,
                        borderColor: colors.border,
                      }}
                    >
                      <Search size={s(13)} color={colors.muted} />
                      <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholder="Search name, phone, address..."
                        placeholderTextColor={colors.muted}
                        style={{
                          flex: 1,
                          marginLeft: s(8),
                          color: colors.heading,
                          fontSize: s(12),
                          padding: 0,
                        }}
                      />
                      {searchQuery.length > 0 && (
                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                          <X size={s(13)} color={colors.muted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* Top customers quick-pick */}
                  {topCustomers.length > 0 && !searchQuery && (
                    <View
                      style={{ paddingHorizontal: s(12), paddingBottom: s(8) }}
                    >
                      <Text
                        style={{
                          fontSize: s(9),
                          color: colors.muted,
                          fontWeight: "600",
                          letterSpacing: 0.8,
                          textTransform: "uppercase",
                          marginBottom: s(6),
                        }}
                      >
                        Frequent
                      </Text>
                      <View style={{ flexDirection: "row", gap: s(8) }}>
                        {topCustomers.map((c) => (
                          <TouchableOpacity
                            key={c.id}
                            disabled={isAssignDisabled}
                            onPress={() => handleSelectCustomer(c)}
                            onLongPress={() => handleLongPressCustomer(c)}
                            style={{
                              flex: 1,
                              flexDirection: "row",
                              alignItems: "center",
                              gap: s(6),
                              paddingHorizontal: s(10),
                              paddingVertical: s(8),
                              borderRadius: s(8),
                              backgroundColor: colors.teal + "10",
                              borderWidth: 1,
                              borderColor: colors.teal + "30",
                              opacity: isAssignDisabled ? 0.6 : 1,
                            }}
                          >
                            <View
                              style={{
                                width: s(24),
                                height: s(24),
                                borderRadius: s(12),
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: colors.teal + "20",
                              }}
                            >
                              <Text
                                style={{
                                  color: colors.teal,
                                  fontSize: s(10),
                                  fontWeight: "700",
                                }}
                              >
                                {(c.name || "?")[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={{
                                  color: colors.heading,
                                  fontSize: s(11),
                                  fontWeight: "600",
                                }}
                                numberOfLines={1}
                              >
                                {c.name}
                              </Text>
                              <Text
                                style={{ color: colors.muted, fontSize: s(9) }}
                              >
                                {c.total_orders} orders
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <FlashList
                    data={directoryRows}
                    // Two cell kinds recycle into separate pools — see the
                    // note on `directoryRows`.
                    getItemType={(item) =>
                      typeof item === "string" ? "header" : "row"
                    }
                    keyExtractor={(item) =>
                      typeof item === "string" ? `hdr-${item}` : item.id
                    }
                    // A ballpark for virtualization; FlashList self-corrects
                    // after first layout. Rows are avatar + 2-3 text lines.
                    estimatedItemSize={s(58)}
                    contentContainerStyle={{
                      paddingHorizontal: s(12),
                      paddingBottom: s(20),
                    }}
                    renderItem={({ item }) =>
                      typeof item === "string" ? (
                      <View
                        style={{
                          paddingVertical: s(4),
                          paddingHorizontal: s(4),
                          marginBottom: s(4),
                          marginTop: s(8),
                          borderBottomWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: colors.teal,
                            fontSize: s(11),
                            fontWeight: "700",
                            letterSpacing: 1,
                          }}
                        >
                          {item}
                        </Text>
                      </View>
                      ) : (
                      <TouchableOpacity
                        disabled={isAssignDisabled}
                        onPress={() => handleSelectCustomer(item)}
                        onLongPress={() => handleLongPressCustomer(item)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          paddingHorizontal: s(12),
                          paddingVertical: s(10),
                          borderRadius: s(8),
                          borderWidth: 1,
                          marginBottom: s(6),
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                          opacity: isAssignDisabled ? 0.6 : 1,
                        }}
                      >
                        <View
                          style={{
                            width: s(30),
                            height: s(30),
                            borderRadius: s(15),
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: s(10),
                            backgroundColor: colors.teal + "20",
                          }}
                        >
                          <Text
                            style={{
                              color: colors.teal,
                              fontSize: s(12),
                              fontWeight: "700",
                            }}
                          >
                            {(item.name || "?")[0].toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: s(12),
                              fontWeight: "600",
                            }}
                          >
                            {item.name || "Unknown"}
                          </Text>
                          <Text
                            style={{
                              color: colors.label,
                              fontSize: s(11),
                              marginTop: s(1),
                            }}
                          >
                            {item.phone ?? item.phoneNumber}
                          </Text>
                          {item.address ? (
                            <Text
                              style={{
                                color: colors.muted,
                                fontSize: s(11),
                                marginTop: s(1),
                              }}
                              numberOfLines={1}
                            >
                              {formatAddress(item.address)}
                            </Text>
                          ) : null}
                        </View>
                        {item.is_offline && (
                          <View
                            style={{
                              paddingHorizontal: s(6),
                              paddingVertical: s(2),
                              borderRadius: s(6),
                              backgroundColor: colors.warning + "20",
                              borderWidth: 1,
                              borderColor: colors.warning + "40",
                            }}
                          >
                            <Text
                              style={{ color: colors.warning, fontSize: s(11) }}
                            >
                              Offline
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      )
                    }
                    ListEmptyComponent={
                      <Text
                        style={{
                          color: colors.muted,
                          fontSize: s(12),
                          textAlign: "center",
                          paddingVertical: s(32),
                        }}
                      >
                        No customers found.
                      </Text>
                    }
                  />
                </View>
              ) : (
                <View style={{ padding: s(16), gap: s(14) }}>
                  {/* No ScrollView. The form is sized to fit inside the
                      keyboard safe zone, so any future field that would
                      overflow shows up as a visible QA failure instead of a
                      silent scroll. Taps on the address suggestions still land
                      without keyboardShouldPersistTaps because the modal box
                      sits in its own no-op TouchableWithoutFeedback, which
                      keeps the overlay Keyboard.dismiss handler from
                      swallowing the first tap. */}
                  <Text style={{ color: colors.muted, fontSize: s(11) }}>
                    {viewMode === "edit"
                      ? "Update customer name or address. Phone number cannot be changed."
                      : "Phone and address are optional."}
                  </Text>

                  {/* Name and phone share one row. Landscape has the width to
                      spare, and dropping a whole field row (~90px) is what
                      lets the form clear the keyboard. */}
                  <View style={{ flexDirection: "row", gap: s(12) }}>
                    <View style={{ flex: 1, gap: s(5) }}>
                      <Text style={fieldLabelStyle}>Full Name *</Text>
                      <TextInput
                        value={newName}
                        onChangeText={setNewName}
                        // Name leads the form, so it's the field that should
                        // be focused when the "add" form first opens.
                        autoFocus={viewMode === "add"}
                        onFocus={() => setIsNameFocused(true)}
                        onBlur={() => setIsNameFocused(false)}
                        placeholder="e.g. John Doe"
                        placeholderTextColor={colors.muted}
                        style={[
                          fieldInputStyle,
                          {
                            borderColor: isNameFocused
                              ? colors.teal
                              : colors.border,
                          },
                        ]}
                      />
                    </View>

                    <View style={{ flex: 1, gap: s(5) }}>
                      <Text style={fieldLabelStyle}>
                        Phone Number{" "}
                        {viewMode === "add" ? "(optional)" : "(read-only)"}
                      </Text>
                      <TextInput
                        value={newPhone}
                        onChangeText={
                          viewMode === "edit" ? undefined : handlePhoneChange
                        }
                        editable={viewMode !== "edit"}
                        onFocus={() => setIsPhoneFocused(true)}
                        onBlur={() => setIsPhoneFocused(false)}
                        placeholder="(555) 555-5555"
                        maxLength={14}
                        keyboardType="phone-pad"
                        inputMode="tel"
                        placeholderTextColor={colors.muted}
                        style={[
                          fieldInputStyle,
                          {
                            backgroundColor:
                              viewMode === "edit"
                                ? colors.card + "80"
                                : colors.card,
                            borderColor:
                              viewMode === "edit"
                                ? colors.border
                                : isPhoneFocused
                                  ? colors.teal
                                  : colors.border,
                            color:
                              viewMode === "edit"
                                ? colors.muted
                                : colors.heading,
                          },
                        ]}
                      />
                    </View>
                  </View>

                  <View style={{ gap: s(5) }}>
                    <Text style={fieldLabelStyle}>Delivery Address</Text>
                    <AddressAutocomplete
                      value={addressDisplay}
                      onChangeText={(text) => {
                        setAddressDisplay(text);
                        setStreet(text);
                        setCity("");
                        setStateCode("");
                        setZip("");
                      }}
                      onAddressSelected={(addr) => {
                        setStreet(addr.street);
                        setCity(addr.city);
                        setStateCode(addr.state);
                        setZip(addr.zip);
                        setAddressDisplay(
                          [addr.street, addr.city, addr.state, addr.zip]
                            .filter(Boolean)
                            .join(", "),
                        );
                      }}
                      placeholder="Search address..."
                      dropdownPosition="top"
                      onFocus={() => setIsAddressFocused(true)}
                      onBlur={() => setIsAddressFocused(false)}
                      inputStyle={{
                        borderColor: isAddressFocused
                          ? colors.teal
                          : colors.border,
                      }}
                    />
                    {(city || stateCode || zip) && (
                      <View
                        style={{
                          flexDirection: "row",
                          gap: s(6),
                          flexWrap: "wrap",
                          marginTop: s(4),
                        }}
                      >
                        {[street, city, stateCode, zip]
                          .filter(Boolean)
                          .map((v, i) => (
                            <Text
                              key={i}
                              style={{
                                fontSize: s(11),
                                color: colors.muted,
                                backgroundColor: colors.card,
                                paddingHorizontal: s(6),
                                paddingVertical: s(2),
                                borderRadius: s(4),
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              {v}
                            </Text>
                          ))}
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={
                      viewMode === "edit"
                        ? handleSaveEditCustomer
                        : handleSaveNewCustomer
                    }
                    style={{
                      borderRadius: s(8),
                      height: s(46),
                      paddingHorizontal: s(16),
                      alignItems: "center",
                      justifyContent: "center",
                      marginTop: s(4),
                      backgroundColor: colors.teal + "18",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                    }}
                  >
                    <Text
                      style={{
                        color: colors.teal,
                        fontSize: s(14),
                        fontWeight: "700",
                      }}
                    >
                      {viewMode === "edit"
                        ? "Update Customer"
                        : "Save Customer"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default CustomerSheet;
