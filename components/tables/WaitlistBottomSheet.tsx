import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useWaitlistSheetStore } from "@/stores/useWaitlistSheetStore";
import { useWaitlistStore } from "@/stores/useWaitlistStore";
import {
  WaitlistEntry,
  FloorPlanObject,
} from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Phone,
  StickyNote,
  UserPlus,
  Users,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useToast } from "@/contexts/ToastContext";

// ── Helpers ──────────────────────────────────────────────────

function getElapsedMinutes(createdAt: string): number {
  return Math.floor(
    (Date.now() - new Date(createdAt).getTime()) / 60_000,
  );
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── WaitlistCard ─────────────────────────────────────────────

const WaitlistCard: React.FC<{
  entry: WaitlistEntry;
  isExpanded: boolean;
  onToggle: () => void;
  onSeat: () => void;
  onNotify: () => void;
  onDelete: () => void;
  now: number; // timestamp to force re-render
}> = ({ entry, isExpanded, onToggle, onSeat, onNotify, onDelete, now }) => {
  const elapsed = getElapsedMinutes(entry.created_at);
  const isOverdue = elapsed > entry.quoted_wait_minutes;

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      className="mb-3 rounded-xl overflow-hidden bg-card border border-border"
    >
      {/* Collapsed Row */}
      <Pressable
        onPress={onToggle}
        className="flex-row items-center px-4 py-3"
      >
        {/* Time Badge */}
        <View
          className={`w-12 h-12 rounded-full items-center justify-center ${
            isOverdue ? "bg-red-900/60" : "bg-teal/20"
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              isOverdue ? "text-red-400" : "text-teal"
            }`}
          >
            {formatElapsed(elapsed)}
          </Text>
        </View>

        {/* Name + Guests */}
        <View className="flex-1 ml-3 min-w-0">
          <Text className="text-white font-semibold text-base" numberOfLines={1}>
            {entry.party_name}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Users size={12} color={colors.muted} />
            <Text className="text-muted text-sm ml-1">
              {entry.party_size} {entry.party_size === 1 ? "guest" : "guests"}
            </Text>
          </View>
        </View>

        {/* Chevron */}
        {isExpanded ? (
          <ChevronUp size={20} color={colors.label} />
        ) : (
          <ChevronDown size={20} color={colors.label} />
        )}
      </Pressable>

      {/* Expanded Section */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className="px-4 pb-4 border-t border-border"
        >
          <View className="mt-3 gap-2">
            {/* Phone */}
            {entry.phone ? (
              <View className="flex-row items-center">
                <Phone size={14} color={colors.label} />
                <Text className="text-label text-sm ml-2">{entry.phone}</Text>
              </View>
            ) : null}

            {/* Notes */}
            {entry.notes ? (
              <View className="flex-row items-start">
                <StickyNote size={14} color={colors.label} style={{ marginTop: 2 }} />
                <Text className="text-label text-sm ml-2 italic flex-1">
                  {entry.notes}
                </Text>
              </View>
            ) : null}

            {/* Quoted time */}
            <View className="flex-row items-center">
              <Clock size={14} color={colors.label} />
              <Text className="text-label text-sm ml-2">
                Quoted: {entry.quoted_wait_minutes} min
              </Text>
            </View>
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-3 mt-4">
            <TouchableOpacity
              onPress={onSeat}
              className="flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg bg-teal"
            >
              <Check size={16} color="white" />
              <Text className="text-white font-semibold">Seat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onNotify}
              className="flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg border border-border"
            >
              <Bell size={16} color={colors.label} />
              <Text className="text-label font-semibold">Notify</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDelete}
              className="w-11 h-11 items-center justify-center rounded-lg bg-red-900/30"
            >
              <X size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  );
};

// ── AddEntryForm ─────────────────────────────────────────────

const AddEntryForm: React.FC<{
  onSubmit: (data: {
    name: string;
    partySize: number;
    quotedTime: number;
    notes: string;
    phone?: string;
  }) => void;
  onCancel: () => void;
  isLoading: boolean;
}> = ({ onSubmit, onCancel, isLoading }) => {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [quotedTime, setQuotedTime] = useState("15");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = () => {
    onSubmit({
      name: name || "Guest",
      partySize: parseInt(partySize || "2", 10),
      quotedTime: parseInt(quotedTime || "15", 10),
      notes,
      phone: phone || undefined,
    });
    setName("");
    setPartySize("");
    setQuotedTime("15");
    setNotes("");
    setPhone("");
  };

  return (
    <View className="px-4 pt-2 pb-6 gap-4">
      {/* Name */}
      <View>
        <Text className="text-label text-sm mb-1.5 font-medium">Guest Name</Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter name"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.screen,
            color: "white",
            fontSize: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      </View>

      {/* Party Size + Quoted Time */}
      <View className="flex-row gap-4">
        <View className="flex-1">
          <Text className="text-label text-sm mb-1.5 font-medium">Party Size</Text>
          <BottomSheetTextInput
            value={partySize}
            onChangeText={setPartySize}
            keyboardType="numeric"
            placeholder="2"
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.screen,
              color: "white",
              fontSize: 16,
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        </View>
        <View className="flex-1">
          <Text className="text-label text-sm mb-1.5 font-medium">Wait Time (min)</Text>
          <BottomSheetTextInput
            value={quotedTime}
            onChangeText={setQuotedTime}
            keyboardType="numeric"
            placeholder="15"
            placeholderTextColor={colors.muted}
            style={{
              backgroundColor: colors.screen,
              color: "white",
              fontSize: 16,
              padding: 14,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          />
        </View>
      </View>

      {/* Phone */}
      <View>
        <Text className="text-label text-sm mb-1.5 font-medium">Phone (Optional)</Text>
        <BottomSheetTextInput
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          placeholder="Phone number"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.screen,
            color: "white",
            fontSize: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      </View>

      {/* Notes */}
      <View>
        <Text className="text-label text-sm mb-1.5 font-medium">Notes (Optional)</Text>
        <BottomSheetTextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Special requests, allergies..."
          placeholderTextColor={colors.muted}
          multiline
          style={{
            backgroundColor: colors.screen,
            color: "white",
            fontSize: 16,
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            height: 80,
            textAlignVertical: "top",
          }}
        />
      </View>

      {/* Buttons */}
      <View className="flex-row gap-3 mt-2">
        <TouchableOpacity
          onPress={onCancel}
          className="flex-1 py-3.5 rounded-xl items-center border border-border"
        >
          <Text className="text-label font-semibold text-base">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isLoading}
          className={`flex-1 py-3.5 rounded-xl items-center bg-teal ${
            isLoading ? "opacity-50" : ""
          }`}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-base">Add to Waitlist</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── TablePickerSheet ─────────────────────────────────────────

const TablePickerSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectTable: (table: FloorPlanObject) => void;
  entry: WaitlistEntry | null;
}> = ({ isOpen, onClose, onSelectTable, entry }) => {
  const sheetRef = useRef<BottomSheet>(null);
  const tables = useFloorPlanStore((s) => s.tables);
  const snapPoints = useMemo(() => ["55%"], []);

  const availableTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          (t.session?.status || "available") === "available" &&
          (t.category === "table" || t.category === "booth"),
      ),
    [tables],
  );

  const recommendedTables = useMemo(
    () =>
      availableTables.filter(
        (t) => (t.capacity || 0) >= (entry?.party_size || 0),
      ),
    [availableTables, entry],
  );

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior="close"
        />
      )}
    >
      <BottomSheetView className="flex-1 bg-panel px-4 pt-2">
        <Text className="text-white text-xl font-bold mb-1">
          Seat {entry?.party_name}
        </Text>
        <Text className="text-muted text-sm mb-4">
          Party of {entry?.party_size} — Quoted {entry?.quoted_wait_minutes}m
        </Text>

        <Text className="text-teal font-semibold text-xs uppercase tracking-wider mb-3">
          Available Tables
        </Text>

        <BottomSheetFlatList
          data={recommendedTables}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => onSelectTable(item)}
              className="bg-card p-4 rounded-xl mb-2.5 flex-row justify-between items-center border border-border"
            >
              <View>
                <Text className="text-white text-base font-semibold">
                  {item.name}
                </Text>
                <Text className="text-muted text-sm">
                  Capacity: {item.capacity}
                </Text>
              </View>
              <View className="bg-teal px-4 py-2 rounded-lg">
                <Text className="text-white font-semibold">Seat</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-muted italic text-center">
                No available tables match the party size.
              </Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </BottomSheetView>
    </BottomSheet>
  );
};

// ── WaitlistBottomSheet (main export) ────────────────────────

const WaitlistBottomSheet: React.FC = () => {
  const sheetRef = useRef<BottomSheet>(null);
  const { isOpen, closeSheet, initialMode } = useWaitlistSheetStore();
  const {
    waitlist,
    isLoading,
    fetchWaitlist,
    addToWaitlistAsync,
    removeFromWaitlistAsync,
    seatFromWaitlistAsync,
  } = useWaitlistStore();
  const startNewOrder = useOrderStore((s) => s.startNewOrder);
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const router = useRouter();
  const { show } = useToast();

  const [viewMode, setViewMode] = useState<"list" | "add">("list");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null);
  const [isTablePickerOpen, setTablePickerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null);
  const [now, setNow] = useState(Date.now());

  const snapPoints = useMemo(() => ["70%", "95%"], []);

  // Timer: update elapsed time every 60s
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Open/close sheet
  useEffect(() => {
    if (isOpen) {
      setViewMode(initialMode);
      // Defer expand so viewMode state settles before the sheet animates
      requestAnimationFrame(() => {
        sheetRef.current?.expand();
      });
      if (selectedStore?.id) {
        fetchWaitlist(selectedStore.id);
      }
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  // Reset view mode when sheet closes
  const handleClose = useCallback(() => {
    closeSheet();
    setViewMode("list");
    setExpandedId(null);
    setSelectedEntry(null);
  }, [closeSheet]);

  // Toggle expand
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Seat action
  const handleSeat = useCallback((entry: WaitlistEntry) => {
    setSelectedEntry(entry);
    setTablePickerOpen(true);
  }, []);

  // Table selected → seat guest
  const handleSelectTable = useCallback(
    async (table: FloorPlanObject) => {
      if (!selectedEntry) return;

      const result = await seatFromWaitlistAsync(selectedEntry.id, [table.id]);

      if (result?.order_id) {
        setActiveOrder(result.order_id);
      } else {
        const newOrder = startNewOrder({
          guestCount: selectedEntry.party_size,
          tableId: table.id,
        });
        setActiveOrder(newOrder.id);
      }

      router.push(`/tables/${table.id}`);
      setTablePickerOpen(false);
      setSelectedEntry(null);
      handleClose();
    },
    [selectedEntry, seatFromWaitlistAsync, startNewOrder, setActiveOrder, router, handleClose],
  );

  // Notify action
  const handleNotify = useCallback(
    async (entry: WaitlistEntry) => {
      try {
        await useFloorPlanStore.getState().notifyWaitlistParty(entry.id);
        show({
          title: "Notification Sent",
          message: `${entry.party_name} has been notified.`,
          type: "success",
        });
        // Refresh waitlist
        if (selectedStore?.id) {
          fetchWaitlist(selectedStore.id);
        }
      } catch {
        show({
          title: "Could Not Notify",
          message: `Failed to notify ${entry.party_name}. Please try again.`,
          type: "error",
        });
      }
    },
    [show, selectedStore?.id, fetchWaitlist],
  );

  // Delete confirm
  const confirmDelete = useCallback(async () => {
    if (itemToDelete) {
      await removeFromWaitlistAsync(itemToDelete.id);
      setItemToDelete(null);
    }
  }, [itemToDelete, removeFromWaitlistAsync]);

  // Add entry
  const handleAddEntry = useCallback(
    async (data: {
      name: string;
      partySize: number;
      quotedTime: number;
      notes: string;
      phone?: string;
    }) => {
      if (!selectedStore?.id) return;

      await addToWaitlistAsync({
        locationId: selectedStore.id,
        p_party_name: data.name,
        p_party_size: data.partySize,
        p_quoted_wait_minutes: data.quotedTime,
        p_notes: data.notes,
        p_phone: data.phone,
      });
      setViewMode("list");
    },
    [selectedStore?.id, addToWaitlistAsync],
  );

  const renderItem = useCallback(
    ({ item }: { item: WaitlistEntry }) => (
      <WaitlistCard
        entry={item}
        isExpanded={expandedId === item.id}
        onToggle={() => handleToggle(item.id)}
        onSeat={() => handleSeat(item)}
        onNotify={() => handleNotify(item)}
        onDelete={() => setItemToDelete(item)}
        now={now}
      />
    ),
    [expandedId, handleToggle, handleSeat, handleNotify, now],
  );

  const keyExtractor = useCallback((item: WaitlistEntry) => item.id, []);

  return (
    <>
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        onClose={handleClose}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        {...bottomSheetTheme}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
            pressBehavior="close"
          />
        )}
      >
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-3 border-b border-border">
          <View className="flex-row items-center gap-3">
            <Text className="text-white text-xl font-bold">Waitlist</Text>
            <View className="bg-card px-2.5 py-1 rounded-full">
              <Text className="text-muted text-sm font-medium">
                {waitlist.length} {waitlist.length === 1 ? "party" : "parties"}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() =>
              setViewMode((m) => (m === "list" ? "add" : "list"))
            }
            className={`w-10 h-10 rounded-full items-center justify-center ${
              viewMode === "add" ? "bg-red-900/30" : "bg-teal/20"
            }`}
          >
            {viewMode === "add" ? (
              <X size={20} color={colors.danger} />
            ) : (
              <UserPlus size={20} color={colors.teal} />
            )}
          </TouchableOpacity>
        </View>

        {/* Content */}
        {viewMode === "add" ? (
          <AddEntryForm
            onSubmit={handleAddEntry}
            onCancel={() => setViewMode("list")}
            isLoading={isLoading}
          />
        ) : isLoading && waitlist.length === 0 ? (
          <View className="flex-1 items-center justify-center py-12">
            <ActivityIndicator size="large" color={colors.teal} />
            <Text className="text-muted mt-3">Loading waitlist...</Text>
          </View>
        ) : waitlist.length > 0 ? (
          <BottomSheetFlatList
            data={waitlist}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center py-12">
            <Clock size={48} color={colors.muted} />
            <Text className="text-muted text-lg mt-4">No parties waiting</Text>
            <Text className="text-muted text-sm mt-1">
              Tap the + to add someone
            </Text>
          </View>
        )}
      </BottomSheet>

      {/* Table Picker Sub-Sheet */}
      <TablePickerSheet
        isOpen={isTablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        onSelectTable={handleSelectTable}
        entry={selectedEntry}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Remove from Waitlist?"
        description={`Are you sure you want to remove ${itemToDelete?.party_name} from the waitlist?`}
        confirmText="Remove"
        variant="destructive"
      />
    </>
  );
};

export default WaitlistBottomSheet;
