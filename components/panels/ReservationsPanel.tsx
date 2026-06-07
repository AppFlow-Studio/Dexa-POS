import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useToast } from "@/contexts/ToastContext";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { getCachedCustomers } from "@/services/customer";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { CustomerWithMeta } from "@/types/customer";
import { Reservation } from "@/types/db-floor-plan-types";
import {
    AlertCircle,
    CalendarClock,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    Edit3,
    MapPin,
    Phone,
    Search,
    Star,
    StickyNote,
    UserCheck,
    UserPlus,
    Users,
    X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Keyboard,
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Calendar, DateData } from "react-native-calendars";
import Animated, {
    FadeIn,
    FadeOut,
    LinearTransition,
} from "react-native-reanimated";

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(isoOrTime: string): string {
  const d = new Date(isoOrTime);
  if (isNaN(d.getTime())) return isoOrTime;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function toEditableTime(isoOrTime: string): string {
  const d = new Date(isoOrTime);
  if (!isNaN(d.getTime())) {
    return `${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes(),
    ).padStart(2, "0")}`;
  }
  const match = isoOrTime.match(/(\d{2}:\d{2})/);
  return match?.[1] ?? "19:00";
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toIsoDateKeySafe(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toISOString().split("T")[0];
  } catch {
    return null;
  }
}

function toEpochSafe(value: Date | string | null | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const d = value instanceof Date ? value : new Date(value);
  const t = d.getTime();
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

function getReservationDateKey(reservation: Reservation): string | null {
  return (
    toIsoDateKeySafe(reservation.reservation_date) ??
    toIsoDateKeySafe(reservation.reservation_time)
  );
}

function getReservationEpoch(reservation: Reservation): number {
  const direct = toEpochSafe(reservation.reservation_time);
  if (direct !== Number.MAX_SAFE_INTEGER) return direct;

  if (reservation.reservation_date && reservation.reservation_time) {
    // Supports records stored as separate date + time fields.
    const combined = `${reservation.reservation_date}T${reservation.reservation_time}`;
    return toEpochSafe(combined);
  }

  return Number.MAX_SAFE_INTEGER;
}

type StatusDotColor = string;

function getStatusColor(status: Reservation["status"]): StatusDotColor {
  switch (status) {
    case "pending":
      return colors.warning;
    case "confirmed":
      return colors.info;
    case "reminded":
      return colors.info;
    case "arrived":
      return colors.success;
    case "seated":
      return colors.teal;
    case "no_show":
      return colors.danger;
    case "cancelled":
      return colors.muted;
    case "completed":
      return colors.muted;
    default:
      return colors.muted;
  }
}

function getStatusLabel(status: Reservation["status"]): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "reminded":
      return "Reminded";
    case "arrived":
      return "Arrived";
    case "seated":
      return "Seated";
    case "no_show":
      return "No Show";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    default:
      return status;
  }
}

// ─── Time presets for picker ─────────────────────────────────────────────────

function buildTimePresets(): string[] {
  const times: string[] = [];
  for (let h = 9; h <= 22; h++) {
    times.push(`${String(h).padStart(2, "0")}:00`);
    times.push(`${String(h).padStart(2, "0")}:30`);
  }
  return times;
}

const TIME_PRESETS = buildTimePresets();

function formatPreset(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${ampm}`;
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputStyle = {
  backgroundColor: colors.inset,
  color: colors.heading,
  fontSize: 13,
  paddingHorizontal: 10,
  paddingVertical: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
};

const labelStyle = {
  fontSize: 10,
  fontWeight: "700" as const,
  color: colors.muted,
  letterSpacing: 0.25,
  marginBottom: 6,
};

// ─── AddReservationModal ─────────────────────────────────────────────────────

interface AddReservationData {
  name: string;
  partySize: number;
  phone: string;
  date: Date;
  time: string;
  tableIds: string[];
  notes: string;
  isVip: boolean;
}

const HOURS = Array.from({ length: 14 }, (_, i) => {
  const h = i + 9; // 9 AM → 10 PM
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 12 ? 12 : h > 12 ? h - 12 : h;
  return { value: String(h).padStart(2, "0"), label: `${h12} ${ampm}` };
});
const MINUTES = [
  { value: "00", label: ":00" },
  { value: "15", label: ":15" },
  { value: "30", label: ":30" },
  { value: "45", label: ":45" },
];

const TIME_ITEM_H = 36;
const TIME_VISIBLE_ROWS = 3;
interface FailureModalState {
  visible: boolean;
  title: string;
  message: string;
}

const DrumColumn: React.FC<{
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  width: number;
  renderItem: (value: string, active: boolean) => React.ReactNode;
}> = ({ items, selected, onSelect, width, renderItem }) => {
  const ref = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    const idx = items.indexOf(selected);
    if (idx >= 0) {
      ref.current?.scrollTo({ y: idx * TIME_ITEM_H, animated: false });
    }
  }, [items, selected]);

  const handleScrollEnd = (y: number) => {
    const idx = Math.round(y / TIME_ITEM_H);
    const clamped = Math.max(0, Math.min(idx, items.length - 1));
    const next = items[clamped];
    if (next !== selected) onSelect(next);
  };

  const pad = TIME_ITEM_H * Math.floor(TIME_VISIBLE_ROWS / 2);

  return (
    <View
      style={{
        width,
        height: TIME_ITEM_H * TIME_VISIBLE_ROWS,
        overflow: "hidden",
      }}
    >
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: TIME_ITEM_H * Math.floor(TIME_VISIBLE_ROWS / 2),
          height: TIME_ITEM_H,
          backgroundColor: `${colors.teal}14`,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: `${colors.teal}45`,
          zIndex: 1,
        }}
      />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={TIME_ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={(e) =>
          handleScrollEnd(e.nativeEvent.contentOffset.y)
        }
        onScrollEndDrag={(e) => handleScrollEnd(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingTop: pad, paddingBottom: pad }}
      >
        {items.map((value, idx) => (
          <TouchableOpacity
            key={`${value}-${idx}`}
            onPress={() => {
              onSelect(value);
              ref.current?.scrollTo({ y: idx * TIME_ITEM_H, animated: true });
            }}
            style={{
              height: TIME_ITEM_H,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {renderItem(value, value === selected)}
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const AddReservationModal: React.FC<{
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: AddReservationData) => Promise<void>;
  isLoading: boolean;
  defaultDate: Date;
  availableTables: { id: string; name: string; occupied?: boolean }[];
  initialData?: Reservation | null;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
}> = ({
  visible,
  onClose,
  onSubmit,
  isLoading,
  defaultDate,
  availableTables,
  initialData = null,
  title = "New Reservation",
  subtitle = "Create and assign a booking in one step",
  submitLabel = "Reserve",
}) => {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState(2);
  const [phone, setPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [calendarDraftDate, setCalendarDraftDate] = useState<Date>(defaultDate);
  const [selHour, setSelHour] = useState("19");
  const [selMin, setSelMin] = useState("00");
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isVip, setIsVip] = useState(false);

  // Customer search
  const [customerQuery, setCustomerQuery] = useState("");
  const [linkedCustomer, setLinkedCustomer] = useState<CustomerWithMeta | null>(
    null,
  );
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsBlurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const allCustomers = useMemo(() => getCachedCustomers(), [visible]);

  useEffect(
    () => () => {
      if (suggestionsBlurTimer.current)
        clearTimeout(suggestionsBlurTimer.current);
    },
    [],
  );

  const handleSuggestionsBlur = useCallback(() => {
    if (suggestionsBlurTimer.current)
      clearTimeout(suggestionsBlurTimer.current);
    suggestionsBlurTimer.current = setTimeout(
      () => setShowSuggestions(false),
      150,
    );
  }, []);

  const dismissSuggestions = useCallback(() => {
    if (suggestionsBlurTimer.current)
      clearTimeout(suggestionsBlurTimer.current);
    setShowSuggestions(false);
  }, []);
  const timeOptions = useMemo(
    () => HOURS.flatMap((h) => MINUTES.map((m) => `${h.value}:${m.value}`)),
    [],
  );
  const selectedTime = `${selHour}:${selMin}`;
  const selectedTimeIndex = Math.max(0, timeOptions.indexOf(selectedTime));
  const calendarDraftKey =
    toIsoDateKeySafe(calendarDraftDate) ?? toIsoDateKeySafe(selectedDate) ?? "";

  const calendarMarkedDates = useMemo(
    () => ({
      [calendarDraftKey]: {
        selected: true,
        selectedColor: colors.teal,
      },
    }),
    [calendarDraftKey],
  );

  useEffect(() => {
    if (!visible) return;

    if (initialData) {
      const nextDate = initialData.reservation_date
        ? new Date(`${initialData.reservation_date}T00:00:00`)
        : new Date(initialData.reservation_time);
      const editableTime = toEditableTime(initialData.reservation_time);
      const [hour, minute] = editableTime.split(":");

      setName(initialData.party_name ?? "");
      setPartySize(initialData.party_size ?? 2);
      setPhone(initialData.phone ?? "");
      setSelectedDate(
        Number.isFinite(nextDate.getTime()) ? nextDate : defaultDate,
      );
      setSelHour(hour ?? "19");
      setSelMin(minute ?? "00");
      setSelectedTableIds(initialData.assigned_table_ids ?? []);
      setNotes(initialData.notes ?? initialData.special_requests ?? "");
      setIsVip(Boolean(initialData.is_vip));
      setLinkedCustomer(null);
      setCustomerQuery("");
      return;
    }

    resetForm();
  }, [visible, initialData, defaultDate]);

  const customerResults = useMemo(() => {
    const q = customerQuery.toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return allCustomers
      .filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.phone ?? c.phoneNumber ?? "").includes(q),
      )
      .slice(0, 4);
  }, [customerQuery, allCustomers]);

  const handleSelectCustomer = (c: CustomerWithMeta) => {
    setLinkedCustomer(c);
    setName(c.name ?? "");
    setPhone(c.phone ?? c.phoneNumber ?? "");
    setCustomerQuery("");
    dismissSuggestions();
  };

  const clearCustomer = () => {
    setLinkedCustomer(null);
    setName("");
    setPhone("");
    setCustomerQuery("");
  };

  const setSelectedTime = (time: string) => {
    const [hour, minute] = time.split(":");
    setSelHour(hour);
    setSelMin(minute);
  };

  const shiftTime = (delta: number) => {
    const nextIndex = Math.min(
      timeOptions.length - 1,
      Math.max(0, selectedTimeIndex + delta),
    );
    setSelectedTime(timeOptions[nextIndex]);
  };

  const resetForm = () => {
    setName("");
    setPartySize(2);
    setPhone("");
    setSelectedDate(defaultDate);
    setCalendarDraftDate(defaultDate);
    setShowDatePicker(false);
    setSelHour("19");
    setSelMin("00");
    setSelectedTableIds([]);
    setNotes("");
    setIsVip(false);
    setLinkedCustomer(null);
    setCustomerQuery("");
    dismissSuggestions();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    const d = new Date(selectedDate);
    d.setHours(parseInt(selHour, 10), parseInt(selMin, 10), 0, 0);
    await onSubmit({
      name: name.trim() || "Guest",
      partySize,
      phone: phone.trim(),
      date: d,
      time: selectedTime,
      tableIds: selectedTableIds,
      notes: notes.trim(),
      isVip,
    });
    resetForm();
  };

  const toggleTable = (id: string) => {
    setSelectedTableIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  const isLightTheme = colors.card === "#F1F4F9";
  const formInputSurface = isLightTheme ? colors.card : colors.inset;
  const formControlSurface = isLightTheme ? colors.card : colors.inset;
  const formActionSurface = isLightTheme ? colors.card : colors.screen;
  const themedInputStyle = {
    ...inputStyle,
    backgroundColor: formInputSurface,
  } as const;

  const surfaceCard = {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 10,
  } as const;

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={handleClose}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onPress={handleClose}
        >
          <View
            style={{
              width: "100%",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingTop: 28,
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                backgroundColor: colors.panel,
                borderRadius: 20,
                width: "96%",
                maxWidth: 980,
                borderWidth: 1,
                borderColor: colors.border,
                overflow: "hidden",
                shadowColor: "#000000",
                shadowOpacity: 0.25,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 10 },
                elevation: 10,
              }}
            >
              {/* Header */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  paddingTop: 16,
                  paddingBottom: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View>
                  <Text
                    style={{
                      fontSize: 17,
                      fontWeight: "800",
                      color: colors.heading,
                    }}
                  >
                    {title}
                  </Text>
                  <Text
                    style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                  >
                    {subtitle}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleClose}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.danger + "15",
                    borderWidth: 1,
                    borderColor: colors.danger + "35",
                  }}
                >
                  <X size={14} color={colors.danger} />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 14, gap: 10 }}>
                {/* Customer search — full width at top */}
                <View style={[surfaceCard, { zIndex: 30 }]}>
                  <Text style={labelStyle}>Customer (Optional)</Text>
                  {linkedCustomer ? (
                    /* Linked customer badge */
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.teal + "50",
                        backgroundColor: colors.teal + "10",
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                        gap: 10,
                      }}
                    >
                      <View
                        style={{
                          width: 30,
                          height: 30,
                          borderRadius: 15,
                          backgroundColor: colors.teal + "20",
                          borderWidth: 1,
                          borderColor: colors.teal + "40",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "700",
                            color: colors.teal,
                          }}
                        >
                          {(linkedCustomer.name ?? "G")[0].toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: "600",
                            color: colors.heading,
                          }}
                        >
                          {linkedCustomer.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.label }}>
                          {linkedCustomer.phone ??
                            linkedCustomer.phoneNumber ??
                            ""}
                        </Text>
                      </View>
                      {(linkedCustomer.total_orders ?? 0) > 0 && (
                        <View
                          style={{
                            paddingHorizontal: 7,
                            paddingVertical: 3,
                            borderRadius: 5,
                            backgroundColor: colors.teal + "20",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: colors.teal,
                            }}
                          >
                            {linkedCustomer.total_orders} visits
                          </Text>
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={clearCustomer}
                        style={{
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: formActionSurface,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color: colors.label,
                          }}
                        >
                          Change
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    /* Search input + quick results */
                    <View style={{ zIndex: 30 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          ...themedInputStyle,
                          paddingHorizontal: 10,
                          gap: 8,
                        }}
                      >
                        <Search size={14} color={colors.muted} />
                        <TextInput
                          value={customerQuery}
                          onChangeText={(value) => {
                            setCustomerQuery(value);
                            setShowSuggestions(true);
                          }}
                          onFocus={() => {
                            if (customerQuery.trim().length > 0)
                              setShowSuggestions(true);
                          }}
                          onBlur={handleSuggestionsBlur}
                          onSubmitEditing={() => {
                            dismissSuggestions();
                            Keyboard.dismiss();
                          }}
                          returnKeyType="done"
                          placeholder="Search by name or phone..."
                          placeholderTextColor={colors.muted}
                          style={{
                            flex: 1,
                            color: colors.heading,
                            fontSize: 13,
                          }}
                        />
                        {customerQuery.length > 0 && (
                          <TouchableOpacity
                            onPress={() => setCustomerQuery("")}
                          >
                            <X size={12} color={colors.muted} />
                          </TouchableOpacity>
                        )}
                      </View>
                      {showSuggestions &&
                        customerQuery.trim().length >= 2 &&
                        customerResults.length > 0 && (
                          <View
                            style={{
                              position: "absolute",
                              top: 42,
                              left: 0,
                              right: 0,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: colors.card,
                              overflow: "hidden",
                              zIndex: 40,
                              elevation: 8,
                              shadowColor: "#000",
                              shadowOffset: { width: 0, height: 6 },
                              shadowOpacity: 0.18,
                              shadowRadius: 12,
                            }}
                          >
                            {customerResults.map((c, i) => (
                              <TouchableOpacity
                                key={c.id}
                                onPress={() => handleSelectCustomer(c)}
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
                                  paddingHorizontal: 10,
                                  paddingVertical: 9,
                                  borderTopWidth: i > 0 ? 1 : 0,
                                  borderTopColor: colors.border,
                                }}
                              >
                                <View
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 13,
                                    backgroundColor: colors.teal + "16",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 10,
                                      fontWeight: "700",
                                      color: colors.teal,
                                    }}
                                  >
                                    {(c.name ?? "G")[0].toUpperCase()}
                                  </Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "700",
                                      color: colors.heading,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {c.name ?? "Guest"}
                                  </Text>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color: colors.muted,
                                    }}
                                    numberOfLines={1}
                                  >
                                    {c.phone ?? c.phoneNumber ?? "No phone"}
                                  </Text>
                                </View>
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: "700",
                                    color: colors.teal,
                                  }}
                                >
                                  Select
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      {showSuggestions &&
                        customerQuery.trim().length >= 2 &&
                        customerResults.length === 0 && (
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.muted,
                              marginTop: 6,
                            }}
                          >
                            No matching customer. Continue as new guest.
                          </Text>
                        )}
                    </View>
                  )}
                </View>

                {/* Main Two-Column Layout */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={[surfaceCard, { flex: 0.48, gap: 10 }]}>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "flex-end",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={labelStyle}>Guest Name</Text>
                        <TextInput
                          value={name}
                          onChangeText={setName}
                          placeholder="Enter name"
                          placeholderTextColor={colors.muted}
                          style={themedInputStyle}
                          autoCapitalize="words"
                        />
                      </View>
                      <TouchableOpacity
                        onPress={() => setIsVip((v) => !v)}
                        style={{
                          width: 54,
                          height: 40,
                          borderRadius: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          borderWidth: 1,
                          backgroundColor: isVip
                            ? colors.warning + "20"
                            : formControlSurface,
                          borderColor: isVip
                            ? colors.warning + "50"
                            : colors.border,
                          gap: 1,
                        }}
                      >
                        <Star
                          size={15}
                          color={isVip ? colors.warning : colors.muted}
                        />
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "700",
                            color: isVip ? colors.warning : colors.muted,
                          }}
                        >
                          VIP
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={labelStyle}>Phone</Text>
                        <TextInput
                          value={phone}
                          onChangeText={setPhone}
                          keyboardType="phone-pad"
                          placeholder="Phone number"
                          placeholderTextColor={colors.muted}
                          style={themedInputStyle}
                        />
                      </View>
                      <View style={{ width: 170 }}>
                        <Text style={labelStyle}>Party Size</Text>
                        <View
                          style={{
                            flexDirection: "row",
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            overflow: "hidden",
                            height: 40,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              setPartySize((n) => Math.max(1, n - 1))
                            }
                            style={{
                              width: 40,
                              alignItems: "center",
                              justifyContent: "center",
                              borderRightWidth: 1,
                              borderRightColor: colors.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 18,
                                color: colors.label,
                                lineHeight: 22,
                              }}
                            >
                              −
                            </Text>
                          </TouchableOpacity>
                          <View
                            style={{
                              flex: 1,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: formControlSurface,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 13,
                                fontWeight: "700",
                                color: colors.heading,
                              }}
                            >
                              {partySize} {partySize === 1 ? "guest" : "guests"}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setPartySize((n) => n + 1)}
                            style={{
                              width: 40,
                              alignItems: "center",
                              justifyContent: "center",
                              borderLeftWidth: 1,
                              borderLeftColor: colors.border,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 18,
                                color: colors.teal,
                                lineHeight: 22,
                              }}
                            >
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>

                    <View>
                      <Text style={labelStyle}>Date</Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <TouchableOpacity
                          onPress={() => setSelectedDate((d) => addDays(d, -1))}
                          style={{
                            width: 34,
                            height: 40,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: formControlSurface,
                          }}
                        >
                          <ChevronLeft size={14} color={colors.label} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => {
                            setCalendarDraftDate(selectedDate);
                            setShowDatePicker(true);
                          }}
                          activeOpacity={0.8}
                          style={{
                            flex: 1,
                            height: 40,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: formControlSurface,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 13,
                              fontWeight: "600",
                              color: colors.heading,
                            }}
                          >
                            {formatDateLabel(selectedDate)}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setSelectedDate((d) => addDays(d, 1))}
                          style={{
                            width: 34,
                            height: 40,
                            borderRadius: 8,
                            alignItems: "center",
                            justifyContent: "center",
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: formControlSurface,
                          }}
                        >
                          <ChevronRight size={14} color={colors.label} />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View>
                      <Text style={labelStyle}>Time</Text>
                      <View
                        style={{
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: colors.border,
                          backgroundColor: formControlSurface,
                          padding: 8,
                          gap: 8,
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() => shiftTime(-1)}
                            disabled={selectedTimeIndex <= 0}
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: formControlSurface,
                              opacity: selectedTimeIndex <= 0 ? 0.4 : 1,
                            }}
                          >
                            <ChevronLeft size={14} color={colors.label} />
                          </TouchableOpacity>
                          <View
                            style={{
                              flex: 1,
                              height: 34,
                              borderRadius: 8,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: colors.teal + "50",
                              backgroundColor: colors.teal + "16",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                fontWeight: "800",
                                color: colors.teal,
                              }}
                            >
                              {formatPreset(selectedTime)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => shiftTime(1)}
                            disabled={
                              selectedTimeIndex >= timeOptions.length - 1
                            }
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 8,
                              alignItems: "center",
                              justifyContent: "center",
                              borderWidth: 1,
                              borderColor: colors.border,
                              backgroundColor: formControlSurface,
                              opacity:
                                selectedTimeIndex >= timeOptions.length - 1
                                  ? 0.4
                                  : 1,
                            }}
                          >
                            <ChevronRight size={14} color={colors.label} />
                          </TouchableOpacity>
                        </View>
                        <View
                          style={{
                            flexDirection: "row",
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: formControlSurface,
                            overflow: "hidden",
                            alignSelf: "center",
                          }}
                        >
                          <DrumColumn
                            items={HOURS.map((h) => h.value)}
                            selected={selHour}
                            onSelect={setSelHour}
                            width={118}
                            renderItem={(value, active) => {
                              const label =
                                HOURS.find((h) => h.value === value)?.label ??
                                value;
                              return (
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: active ? "700" : "500",
                                    color: active
                                      ? colors.heading
                                      : colors.muted,
                                  }}
                                >
                                  {label}
                                </Text>
                              );
                            }}
                          />
                          <View
                            style={{ width: 1, backgroundColor: colors.border }}
                          />
                          <DrumColumn
                            items={MINUTES.map((m) => m.value)}
                            selected={selMin}
                            onSelect={setSelMin}
                            width={86}
                            renderItem={(value, active) => {
                              const label =
                                MINUTES.find((m) => m.value === value)?.label ??
                                value;
                              return (
                                <Text
                                  style={{
                                    fontSize: 14,
                                    fontWeight: active ? "700" : "500",
                                    color: active
                                      ? colors.heading
                                      : colors.muted,
                                  }}
                                >
                                  {label}
                                </Text>
                              );
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  </View>

                  <View style={[surfaceCard, { flex: 0.52, gap: 10 }]}>
                    {availableTables.length > 0 && (
                      <View>
                        <Text style={labelStyle}>Table (Optional)</Text>
                        <View
                          style={{
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: colors.border,
                            backgroundColor: formControlSurface,
                            padding: 8,
                            gap: 8,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              {selectedTableIds.length === 0
                                ? "No table selected"
                                : `${selectedTableIds.length} table${
                                    selectedTableIds.length > 1 ? "s" : ""
                                  } selected`}
                            </Text>
                            {selectedTableIds.length > 0 && (
                              <TouchableOpacity
                                onPress={() => setSelectedTableIds([])}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: "700",
                                    color: colors.teal,
                                  }}
                                >
                                  Clear all
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 6,
                            }}
                          >
                            {availableTables.map((t) => {
                              const active = selectedTableIds.includes(t.id);
                              return (
                                <TouchableOpacity
                                  key={t.id}
                                  onPress={() => toggleTable(t.id)}
                                  style={{
                                    minWidth: 52,
                                    paddingHorizontal: 10,
                                    paddingVertical: 7,
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    backgroundColor: active
                                      ? colors.teal + "20"
                                      : t.occupied
                                        ? colors.warning + "10"
                                        : formControlSurface,
                                    borderColor: active
                                      ? colors.teal + "60"
                                      : t.occupied
                                        ? colors.warning + "40"
                                        : colors.border,
                                    alignItems: "center",
                                  }}
                                >
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: "700",
                                      color: active
                                        ? colors.teal
                                        : t.occupied
                                          ? colors.warning
                                          : colors.label,
                                    }}
                                  >
                                    {t.name}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    )}

                    <View>
                      <Text style={labelStyle}>Notes (Optional)</Text>
                      <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        placeholder="Allergies, occasion..."
                        placeholderTextColor={colors.muted}
                        multiline
                        style={{
                          ...themedInputStyle,
                          height: 94,
                          textAlignVertical: "top",
                        }}
                      />
                    </View>
                  </View>
                </View>

                {/* Actions */}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={handleClose}
                    style={{
                      flex: 1,
                      height: 46,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: formActionSurface,
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
                    onPress={handleSubmit}
                    disabled={isLoading}
                    style={{
                      flex: 2,
                      height: 46,
                      borderRadius: 10,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.teal,
                      borderWidth: 1,
                      borderColor: colors.teal,
                      opacity: isLoading ? 0.75 : 1,
                    }}
                  >
                    {isLoading ? (
                      <ActivityIndicator color="#000000" size="small" />
                    ) : (
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          color: "#000000",
                        }}
                      >
                        {submitLabel}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={showDatePicker}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDatePicker(false)}
        statusBarTranslucent
      >
        <Pressable
          style={{ flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onPress={() => setShowDatePicker(false)}
        >
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
          >
            <Pressable
              onPress={() => {}}
              style={{
                width: "100%",
                maxWidth: 460,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.panel,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  paddingHorizontal: 16,
                  paddingTop: 14,
                  paddingBottom: 10,
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
                  Select Reservation Date
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                >
                  {formatDateLabel(calendarDraftDate)}
                </Text>
              </View>

              <View style={{ paddingHorizontal: 10, paddingTop: 10 }}>
                <Calendar
                  current={calendarDraftKey}
                  onDayPress={(day: DateData) => {
                    const picked = new Date(`${day.dateString}T00:00:00`);
                    if (Number.isFinite(picked.getTime())) {
                      setCalendarDraftDate(picked);
                    }
                  }}
                  markedDates={calendarMarkedDates}
                  theme={{
                    calendarBackground: formInputSurface,
                    monthTextColor: colors.heading,
                    dayTextColor: colors.heading,
                    textDisabledColor: colors.muted,
                    selectedDayBackgroundColor: colors.teal,
                    selectedDayTextColor: "#000000",
                    todayTextColor: colors.teal,
                    backgroundColor: formInputSurface,
                    textSectionTitleColor: colors.label,
                  }}
                />
              </View>

              <View
                style={{
                  flexDirection: "row",
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingTop: 10,
                  paddingBottom: 14,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <TouchableOpacity
                  onPress={() => setShowDatePicker(false)}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: formActionSurface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.label,
                    }}
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setSelectedDate(calendarDraftDate);
                    setShowDatePicker(false);
                  }}
                  style={{
                    flex: 1,
                    height: 40,
                    borderRadius: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: colors.teal,
                    backgroundColor: colors.teal,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "700",
                      color: "#000000",
                    }}
                  >
                    Apply Date
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const SeatReservationTablePickerModal: React.FC<{
  visible: boolean;
  reservationName: string;
  tables: { id: string; name: string }[];
  isLoading: boolean;
  onClose: () => void;
  onSelectTable: (table: { id: string; name: string }) => void;
}> = ({
  visible,
  reservationName,
  tables,
  isLoading,
  onClose,
  onSelectTable,
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 420,
            maxWidth: "92%",
            backgroundColor: colors.panel,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
            >
              Select a Table
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}>
              Choose a table for {reservationName} to seat now.
            </Text>
          </View>

          <ScrollView
            style={{ maxHeight: 320 }}
            contentContainerStyle={{ padding: 12, gap: 8 }}
          >
            {isLoading ? (
              <View style={{ paddingVertical: 24, alignItems: "center" }}>
                <ActivityIndicator size="small" color={colors.teal} />
              </View>
            ) : tables.length > 0 ? (
              tables.map((table) => (
                <TouchableOpacity
                  key={table.id}
                  onPress={() => onSelectTable(table)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: colors.heading,
                    }}
                  >
                    {table.name}
                  </Text>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 999,
                      backgroundColor: colors.teal + "18",
                      borderWidth: 1,
                      borderColor: colors.teal + "35",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: colors.teal,
                      }}
                    >
                      Seat Here
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View
                style={{ paddingVertical: 24, alignItems: "center", gap: 6 }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  No available tables
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.muted,
                    textAlign: "center",
                  }}
                >
                  Clear a table first, then try seating this reservation again.
                </Text>
              </View>
            )}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 15, alignItems: "center" }}
            >
              <Text
                style={{ fontSize: 14, fontWeight: "600", color: colors.label }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── ReservationCard ──────────────────────────────────────────────────────────

const ReservationCard: React.FC<{
  reservation: Reservation;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onConfirm: () => void;
  onMarkArrived: () => void;
  onSeat: () => void;
  onCancel: () => void;
  tableNames: string[];
  hasOccupiedTable?: boolean;
}> = ({
  reservation: r,
  isExpanded,
  onToggle,
  onEdit,
  onConfirm,
  onMarkArrived,
  onSeat,
  onCancel,
  tableNames,
  hasOccupiedTable = false,
}) => {
  const statusColor = getStatusColor(r.status);
  const isActionable = ![
    "seated",
    "completed",
    "cancelled",
    "no_show",
  ].includes(r.status);

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      style={{
        marginBottom: 8,
        borderRadius: 10,
        overflow: "hidden",
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      {/* Collapsed row */}
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 10,
          paddingVertical: 10,
        }}
      >
        {/* Time badge */}
        <View
          style={{
            width: 44,
            height: 40,
            borderRadius: 8,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: statusColor + "18",
            borderWidth: 1,
            borderColor: statusColor + "40",
          }}
        >
          <Text
            style={{
              fontSize: 10,
              fontWeight: "700",
              color: statusColor,
              textAlign: "center",
              lineHeight: 13,
            }}
          >
            {formatTime(r.reservation_time)}
          </Text>
        </View>

        {/* Name + size */}
        <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: "600",
                color: colors.heading,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {r.party_name}
            </Text>
            {r.is_vip && <Star size={11} color={colors.warning} />}
          </View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 2,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Users size={11} color={colors.muted} />
              <Text
                style={{ fontSize: 11, color: colors.muted, marginLeft: 3 }}
              >
                {r.party_size}
              </Text>
            </View>
            {/* Status pill */}
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
                backgroundColor: statusColor + "20",
                borderWidth: 1,
                borderColor: statusColor + "40",
              }}
            >
              <Text
                style={{ fontSize: 10, fontWeight: "700", color: statusColor }}
              >
                {getStatusLabel(r.status)}
              </Text>
            </View>
          </View>
        </View>

        {isExpanded ? (
          <ChevronUp size={14} color={colors.muted} />
        ) : (
          <ChevronDown size={14} color={colors.muted} />
        )}
      </Pressable>

      {/* Expanded */}
      {isExpanded && (
        <Animated.View
          entering={iosOnly(FadeIn.duration(150))}
          exiting={iosOnly(FadeOut.duration(100))}
          style={{
            paddingHorizontal: 10,
            paddingBottom: 10,
            borderTopWidth: 1,
            borderTopColor: colors.border,
          }}
        >
          <View style={{ marginTop: 8, gap: 6 }}>
            {r.phone && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Phone size={12} color={colors.label} />
                <Text
                  style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}
                >
                  {r.phone}
                </Text>
              </View>
            )}
            {tableNames.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <MapPin size={12} color={colors.label} />
                <Text
                  style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}
                >
                  {tableNames.join(", ")}
                </Text>
              </View>
            )}
            {(r.notes || r.special_requests) && (
              <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                <StickyNote
                  size={12}
                  color={colors.label}
                  style={{ marginTop: 1 }}
                />
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.label,
                    marginLeft: 6,
                    fontStyle: "italic",
                    flex: 1,
                  }}
                >
                  {r.notes || r.special_requests}
                </Text>
              </View>
            )}
          </View>

          {isActionable && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {/* Occupied table warning */}
              {hasOccupiedTable && r.status === "arrived" && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 8,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: colors.warning + "15",
                    borderWidth: 1,
                    borderColor: colors.warning + "40",
                  }}
                >
                  <AlertCircle
                    size={14}
                    color={colors.warning}
                    style={{ marginTop: 2 }}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 12,
                      color: colors.warning,
                      lineHeight: 16,
                    }}
                  >
                    One or more assigned tables are currently occupied. Wait for
                    them to be cleared before seating.
                  </Text>
                </View>
              )}

              {/* Row 1: Edit + Confirm + Arrived */}
              <View style={{ flexDirection: "row", gap: 6 }}>
                <TouchableOpacity
                  onPress={onEdit}
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: colors.teal + "15",
                    borderWidth: 1,
                    borderColor: colors.teal + "30",
                  }}
                >
                  <Edit3 size={13} color={colors.teal} />
                </TouchableOpacity>
                {r.status === "pending" && (
                  <TouchableOpacity
                    onPress={onConfirm}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: colors.teal + "20",
                      borderWidth: 1,
                      borderColor: colors.teal + "50",
                    }}
                  >
                    <Check size={12} color={colors.teal} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: colors.teal,
                      }}
                    >
                      Confirm
                    </Text>
                  </TouchableOpacity>
                )}
                {["confirmed", "reminded"].includes(r.status) && (
                  <TouchableOpacity
                    onPress={onMarkArrived}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: colors.success + "20",
                      borderWidth: 1,
                      borderColor: colors.success + "50",
                    }}
                  >
                    <UserCheck size={12} color={colors.success} />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: colors.success,
                      }}
                    >
                      Mark Arrived
                    </Text>
                  </TouchableOpacity>
                )}
                {r.status === "arrived" && (
                  <TouchableOpacity
                    onPress={onSeat}
                    disabled={hasOccupiedTable}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 5,
                      paddingVertical: 7,
                      borderRadius: 8,
                      backgroundColor: hasOccupiedTable
                        ? colors.muted + "10"
                        : colors.teal + "20",
                      borderWidth: 1,
                      borderColor: hasOccupiedTable
                        ? colors.muted + "30"
                        : colors.teal + "50",
                      opacity: hasOccupiedTable ? 0.6 : 1,
                    }}
                  >
                    <Check
                      size={12}
                      color={hasOccupiedTable ? colors.muted : colors.teal}
                    />
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: hasOccupiedTable ? colors.muted : colors.teal,
                      }}
                    >
                      {hasOccupiedTable ? "Table Occupied" : "Seat Now"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={onCancel}
                  style={{
                    width: 34,
                    height: 34,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 8,
                    backgroundColor: colors.danger + "15",
                    borderWidth: 1,
                    borderColor: colors.danger + "30",
                  }}
                >
                  <X size={13} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  );
};

// ─── ReservationsPanel ────────────────────────────────────────────────────────

const ReservationsPanel: React.FC = () => {
  const {
    reservations,
    isLoading,
    selectedDate,
    setSelectedDate,
    fetchReservations,
    createReservation,
    updateReservation,
    updateStatus,
    cancelReservation,
    seatReservation,
  } = useReservationStore();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const tables = useFloorPlanStore((s) => s.tables);
  const { show } = useToast();

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reservationToCancel, setReservationToCancel] =
    useState<Reservation | null>(null);
  const [reservationToSeat, setReservationToSeat] =
    useState<Reservation | null>(null);
  const [isSeatPickerOpen, setSeatPickerOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [seatLoading, setSeatLoading] = useState(false);
  const [failureModal, setFailureModal] = useState<FailureModalState>({
    visible: false,
    title: "Failed",
    message: "",
  });

  // All selectable tables — show occupied too (reservation is for a future time)
  // Only exclude permanently unusable tables
  const availableTables = useMemo(
    () =>
      tables
        .filter(
          (t) =>
            ["table", "booth"].includes(t.category) &&
            t.session?.status !== "blocked" &&
            t.session?.status !== "not_in_service",
        )
        .map((t) => ({
          id: t.id,
          name: t.name,
          occupied:
            !!t.session &&
            t.session.status !== "available" &&
            t.session.status !== "cleaning",
        }))
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { numeric: true }),
        ),
    [tables],
  );

  // Filtered reservations for the selected date (active statuses only for list)
  const dateReservations = useMemo(() => {
    const dateStr = toIsoDateKeySafe(selectedDate);
    if (!dateStr) {
      return reservations
        .filter((r) => !["completed", "cancelled"].includes(r.status))
        .sort((a, b) => getReservationEpoch(a) - getReservationEpoch(b));
    }

    return reservations
      .filter((r) => {
        const rDate = getReservationDateKey(r);
        return (
          rDate === dateStr && !["completed", "cancelled"].includes(r.status)
        );
      })
      .sort((a, b) => getReservationEpoch(a) - getReservationEpoch(b));
  }, [reservations, selectedDate]);

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleDateChange = useCallback(
    (delta: number) => {
      const next = addDays(selectedDate, delta);
      setSelectedDate(next);
      if (selectedStore?.id) {
        fetchReservations(selectedStore.id, next, { silent: true });
      }
    },
    [selectedDate, selectedStore?.id, fetchReservations, setSelectedDate],
  );

  const handleAddSubmit = useCallback(
    async (data: AddReservationData) => {
      if (!selectedStore?.id) return;
      setAddLoading(true);
      try {
        const dateStr =
          toIsoDateKeySafe(data.date) ??
          toIsoDateKeySafe(selectedDate) ??
          toIsoDateKeySafe(new Date());
        if (!dateStr) throw new Error("Invalid reservation date");

        const result = await createReservation({
          p_location_id: selectedStore.id,
          p_party_name: data.name,
          p_party_size: data.partySize,
          p_phone: data.phone,
          p_reservation_date: dateStr,
          p_reservation_time: data.time,
          p_assigned_table_ids:
            data.tableIds.length > 0 ? data.tableIds : undefined,
          p_notes: data.notes || undefined,
          p_special_requests: data.notes || undefined,
          p_source: "pos",
          p_is_vip: data.isVip,
        });
        if (result) {
          show({
            title: "Reservation Added",
            message: `${data.name} booked for ${formatPreset(data.time)}`,
            type: "success",
          });
          setShowAddModal(false);
          if (selectedStore?.id)
            fetchReservations(selectedStore.id, selectedDate, { silent: true });
        } else {
          const message = "Could not create reservation";
          show({
            title: "Failed",
            message,
            type: "error",
          });
          setFailureModal({
            visible: true,
            title: "Reservation Failed",
            message,
          });
        }
      } catch (err: any) {
        const message = err.message || "Could not create reservation";
        show({
          title: "Failed",
          message,
          type: "error",
        });
        setFailureModal({
          visible: true,
          title: "Reservation Failed",
          message,
        });
      } finally {
        setAddLoading(false);
      }
    },
    [
      selectedStore?.id,
      createReservation,
      show,
      fetchReservations,
      selectedDate,
    ],
  );

  const handleEditSubmit = useCallback(
    async (data: AddReservationData) => {
      if (!selectedStore?.id || !editingReservation) return;
      setAddLoading(true);
      try {
        const dateStr =
          toIsoDateKeySafe(data.date) ??
          toIsoDateKeySafe(selectedDate) ??
          toIsoDateKeySafe(new Date());
        if (!dateStr) throw new Error("Invalid reservation date");

        const ok = await updateReservation(editingReservation.id, {
          p_location_id: selectedStore.id,
          p_party_name: data.name,
          p_party_size: data.partySize,
          p_phone: data.phone,
          p_reservation_date: dateStr,
          p_reservation_time: data.time,
          p_assigned_table_ids:
            data.tableIds.length > 0 ? data.tableIds : undefined,
          p_duration_minutes: editingReservation.duration_minutes,
          p_email: editingReservation.email,
          p_notes: data.notes || undefined,
          p_preferred_section: editingReservation.preferred_section,
          p_seating_preference: editingReservation.seating_preference,
          p_source: editingReservation.source || "pos",
          p_special_requests: data.notes || undefined,
          p_is_vip: data.isVip,
        });

        if (!ok) throw new Error("Could not update reservation");

        show({
          title: "Reservation Updated",
          message: `${data.name} updated for ${formatPreset(data.time)}`,
          type: "success",
        });
        setEditingReservation(null);
        if (selectedStore?.id) {
          fetchReservations(selectedStore.id, selectedDate, { silent: true });
        }
      } catch (err: any) {
        const message = err.message || "Could not update reservation";
        show({ title: "Failed", message, type: "error" });
        setFailureModal({
          visible: true,
          title: "Update Failed",
          message,
        });
      } finally {
        setAddLoading(false);
      }
    },
    [
      selectedStore?.id,
      editingReservation,
      selectedDate,
      updateReservation,
      show,
      fetchReservations,
    ],
  );

  const handleConfirm = useCallback(
    async (id: string) => {
      await updateStatus(id, "confirmed");
      show({
        title: "Confirmed",
        message: "Reservation confirmed",
        type: "success",
      });
    },
    [updateStatus, show],
  );

  const handleMarkArrived = useCallback(
    async (id: string) => {
      await updateStatus(id, "arrived");
      show({
        title: "Arrived",
        message: "Guest marked as arrived",
        type: "success",
      });
    },
    [updateStatus, show],
  );

  const handleSeat = useCallback(
    async (r: Reservation) => {
      const tableIds = r.assigned_table_ids;
      if (!tableIds || tableIds.length === 0) {
        setReservationToSeat(r);
        setSeatPickerOpen(true);
        return;
      }

      setSeatLoading(true);
      try {
        const result = await seatReservation(r.id, tableIds);
        if (result) {
          show({
            title: "Seated",
            message: `${r.party_name} has been seated`,
            type: "success",
          });
        }
      } catch (err: any) {
        const message =
          err.message || "Please seat the guest manually from the floor plan";
        show({
          title: "Could Not Seat",
          message,
          type: "error",
        });
        setFailureModal({
          visible: true,
          title: "Seating Failed",
          message,
        });
      } finally {
        setSeatLoading(false);
      }
    },
    [seatReservation, show],
  );

  const handleSeatTableSelect = useCallback(
    async (table: { id: string; name: string }) => {
      if (!reservationToSeat) return;

      setSeatLoading(true);
      try {
        const result = await seatReservation(reservationToSeat.id, [table.id]);
        show({
          title: "Seated",
          message: `${reservationToSeat.party_name} seated at ${table.name}`,
          type: "success",
        });
        setSeatPickerOpen(false);
        setReservationToSeat(null);
      } catch (err: any) {
        const message = err.message || "Could not seat reservation";
        show({
          title: "Could Not Seat",
          message,
          type: "error",
        });
        setFailureModal({
          visible: true,
          title: "Seating Failed",
          message,
        });
      } finally {
        setSeatLoading(false);
      }
    },
    [reservationToSeat, seatReservation, show],
  );

  const handleCloseSeatPicker = useCallback(() => {
    setSeatPickerOpen(false);
    setReservationToSeat(null);
  }, []);

  const handleCancelConfirm = useCallback(async () => {
    if (!reservationToCancel) return;
    await cancelReservation(reservationToCancel.id);
    setReservationToCancel(null);
    show({
      title: "Cancelled",
      message: "Reservation cancelled",
      type: "success",
    });
  }, [reservationToCancel, cancelReservation, show]);

  useEffect(() => {
    if (!selectedStore?.id) return;
    fetchReservations(selectedStore.id, selectedDate);
  }, [selectedStore?.id, selectedDate, fetchReservations]);

  // Build a lookup of tableId → name from floor plan
  const tableNameById = useMemo(() => {
    const map: Record<string, string> = {};
    tables.forEach((t) => {
      map[t.id] = t.name;
    });
    return map;
  }, [tables]);

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "column",
        backgroundColor: colors.screen,
      }}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        {/* Title row */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: "700", color: colors.heading }}
          >
            Reservations
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "30",
            }}
          >
            <UserPlus size={14} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* Date navigator */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TouchableOpacity
            onPress={() => handleDateChange(-1)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={14} color={colors.label} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setSelectedDate(new Date());
              if (selectedStore?.id)
                fetchReservations(selectedStore.id, new Date(), {
                  silent: true,
                });
            }}
            style={{
              flex: 1,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: "center",
              backgroundColor: colors.card,
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}
            >
              {formatDateLabel(selectedDate)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDateChange(1)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronRight size={14} color={colors.label} />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
          {dateReservations.length} upcoming{" "}
          {formatDateLabel(selectedDate).toLowerCase()}
        </Text>
      </View>

      {/* List */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
      >
        {isLoading && reservations.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 40,
            }}
          >
            <ActivityIndicator size="small" color={colors.teal} />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>
              Loading reservations...
            </Text>
          </View>
        ) : dateReservations.length > 0 ? (
          dateReservations.map((r) => {
            const tableNames = (r.assigned_table_ids ?? [])
              .map((id) => tableNameById[id])
              .filter(Boolean);
            // Check if any assigned tables are occupied
            const assignedTableObjects = (r.assigned_table_ids ?? [])
              .map((id) => availableTables.find((t) => t.id === id))
              .filter(Boolean);
            const hasOccupiedTable = assignedTableObjects.some(
              (t: any) => t?.occupied,
            );

            return (
              <ReservationCard
                key={r.id}
                reservation={r}
                isExpanded={expandedId === r.id}
                onToggle={() => handleToggle(r.id)}
                onEdit={() => setEditingReservation(r)}
                onConfirm={() => handleConfirm(r.id)}
                onMarkArrived={() => handleMarkArrived(r.id)}
                onSeat={() => handleSeat(r)}
                onCancel={() => setReservationToCancel(r)}
                tableNames={tableNames}
                hasOccupiedTable={hasOccupiedTable}
              />
            );
          })
        ) : (
          <View
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 40,
            }}
          >
            <CalendarClock size={28} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.label, marginTop: 10 }}>
              No reservations {formatDateLabel(selectedDate).toLowerCase()}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>
              Tap + to add one
            </Text>
          </View>
        )}
      </ScrollView>

      <AddReservationModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSubmit}
        isLoading={addLoading}
        defaultDate={selectedDate}
        availableTables={availableTables}
      />

      <AddReservationModal
        visible={!!editingReservation}
        onClose={() => setEditingReservation(null)}
        onSubmit={handleEditSubmit}
        isLoading={addLoading}
        defaultDate={selectedDate}
        availableTables={availableTables}
        initialData={editingReservation}
        title="Edit Reservation"
        subtitle="Update guest details, time, and assigned tables"
        submitLabel="Save Changes"
      />

      <ConfirmationModal
        isOpen={!!reservationToCancel}
        onClose={() => setReservationToCancel(null)}
        onConfirm={handleCancelConfirm}
        title="Cancel Reservation?"
        description={`Are you sure you want to cancel ${reservationToCancel?.party_name}'s reservation?`}
        confirmText="Cancel Reservation"
        variant="destructive"
      />

      <SeatReservationTablePickerModal
        visible={isSeatPickerOpen}
        reservationName={reservationToSeat?.party_name ?? "this reservation"}
        tables={availableTables}
        isLoading={seatLoading}
        onClose={handleCloseSeatPicker}
        onSelectTable={handleSeatTableSelect}
      />

      <Modal
        visible={failureModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() =>
          setFailureModal((prev) => ({ ...prev, visible: false }))
        }
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 16,
            }}
          >
            <Text
              style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}
            >
              {failureModal.title}
            </Text>
            <Text
              style={{
                marginTop: 8,
                fontSize: 13,
                color: colors.label,
                lineHeight: 18,
              }}
            >
              {failureModal.message}
            </Text>
            <TouchableOpacity
              onPress={() =>
                setFailureModal((prev) => ({ ...prev, visible: false }))
              }
              style={{
                marginTop: 14,
                alignSelf: "flex-end",
                backgroundColor: colors.danger,
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 9,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ReservationsPanel;
