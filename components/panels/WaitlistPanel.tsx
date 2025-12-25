import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useWaitlistStore } from "@/stores/useWaitlistStore";
import {
  WaitlistEntry as DBWaitlistEntry,
  FloorPlanObject,
} from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  Check,
  Clock,
  GripVertical,
  Trash2,
  UserPlus,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";

// AddWaitlistEntryModal Component (Themed)
const AddWaitlistEntryModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    partySize: number;
    quotedTime: number;
    notes: string;
    phone?: string;
  }) => void;
  isLoading?: boolean;
}> = ({ isOpen, onClose, onSubmit, isLoading }) => {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [quotedTime, setQuotedTime] = useState("15");
  const [notes, setNotes] = useState("");
  const [phone, setPhone] = useState("");

  const handleSubmit = () => {
    onSubmit({
      name: name || "Guest",
      partySize: parseInt(partySize || "2"),
      quotedTime: parseInt(quotedTime || "15"),
      notes,
      phone: phone || undefined,
    });
    // Reset form
    setName("");
    setPartySize("");
    setQuotedTime("15");
    setNotes("");
    setPhone("");
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isOpen}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-center items-center bg-black/70"
      >
        <Pressable
          className="flex-1 justify-center items-center w-full"
          onPress={onClose}
        >
          <Pressable
            className="bg-[#303030] border border-gray-700 w-[450px] p-6 rounded-2xl"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="flex-row justify-between items-center w-full mb-6">
              <Text className="text-white text-2xl font-bold">
                Add to Waitlist
              </Text>
              <TouchableOpacity
                onPress={onClose}
                className="p-2 bg-[#404040] rounded-full"
              >
                <X size={20} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View className="gap-4">
              <View>
                <Text className="text-gray-400 text-sm mb-2 font-medium">
                  Guest Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter name"
                  placeholderTextColor="#6B7280"
                  className="bg-[#212121] text-white text-lg p-4 rounded-xl border border-gray-600"
                />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-gray-400 text-sm mb-2 font-medium">
                    Party Size
                  </Text>
                  <TextInput
                    value={partySize}
                    onChangeText={setPartySize}
                    keyboardType="numeric"
                    placeholder="2"
                    placeholderTextColor="#6B7280"
                    className="bg-[#212121] text-white text-lg p-4 rounded-xl border border-gray-600"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 text-sm mb-2 font-medium">
                    Wait Time (min)
                  </Text>
                  <TextInput
                    value={quotedTime}
                    onChangeText={setQuotedTime}
                    keyboardType="numeric"
                    placeholder="15"
                    placeholderTextColor="#6B7280"
                    className="bg-[#212121] text-white text-lg p-4 rounded-xl border border-gray-600"
                  />
                </View>
              </View>

              <View>
                <Text className="text-gray-400 text-sm mb-2 font-medium">
                  Phone (Optional)
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  placeholder="Phone number"
                  placeholderTextColor="#6B7280"
                  className="bg-[#212121] text-white text-lg p-4 rounded-xl border border-gray-600"
                />
              </View>

              <View>
                <Text className="text-gray-400 text-sm mb-2 font-medium">
                  Notes (Optional)
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Special requests, allergies..."
                  placeholderTextColor="#6B7280"
                  className="bg-[#212121] text-white text-lg p-4 rounded-xl border border-gray-600 h-24"
                  multiline
                  textAlignVertical="top"
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                disabled={isLoading}
                className={`bg-blue-600 p-4 rounded-xl items-center mt-2 ${
                  isLoading ? "opacity-50" : ""
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-lg">
                    Add to Waitlist
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Table Picker Modal
const TablePickerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSelectTable: (table: FloorPlanObject) => void;
  waitlistEntry: DBWaitlistEntry | null;
}> = ({ isOpen, onClose, onSelectTable, waitlistEntry }) => {
  const { tables } = useFloorPlanStore();
  const availableTables = useMemo(
    () =>
      tables.filter(
        (t) =>
          (t.session?.status || "available") === "available" &&
          t.category === "table"
      ),
    [tables]
  );

  const recommendedTables = useMemo(
    () =>
      availableTables.filter(
        (t) => (t.capacity || 0) >= (waitlistEntry?.party_size || 0)
      ),
    [availableTables, waitlistEntry]
  );

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={isOpen}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        className="flex-1 justify-end"
      >
        <Pressable className="flex-1 bg-black/50" onPress={onClose} />
        <View className="bg-[#303030] rounded-t-3xl h-[60%] p-6">
          <View className="w-12 h-1 bg-gray-600 rounded-full self-center mb-6" />
          <Text className="text-white text-2xl font-bold mb-2">
            Seat {waitlistEntry?.party_name}
          </Text>
          <Text className="text-gray-400 mb-6">
            Party of {waitlistEntry?.party_size} • Quoted{" "}
            {waitlistEntry?.quoted_wait_minutes}m
          </Text>

          <Text className="text-blue-400 font-semibold mb-3 uppercase text-xs tracking-wider">
            Available Tables
          </Text>
          <FlatList
            data={recommendedTables}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelectTable(item)}
                className="bg-[#212121] p-4 rounded-xl mb-3 flex-row justify-between items-center border border-gray-700"
              >
                <View>
                  <Text className="text-white text-lg font-semibold">
                    {item.name}
                  </Text>
                  <Text className="text-gray-400">
                    Capacity: {item.capacity}
                  </Text>
                </View>
                <View className="bg-green-600 px-4 py-2 rounded-lg">
                  <Text className="text-white font-semibold">Seat</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View className="items-center py-8">
                <Text className="text-gray-500 italic text-center">
                  No available tables match the party size.
                </Text>
              </View>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Waitlist Item Component
const WaitlistItem: React.FC<{
  item: DBWaitlistEntry;
  onSeat: () => void;
  onDelete: () => void;
  drag?: () => void;
  isActive?: boolean;
}> = ({ item, onSeat, onDelete, drag, isActive }) => {
  const elapsed = Math.floor(
    (new Date().getTime() - new Date(item.created_at).getTime()) / 60000
  );
  const isOverdue = elapsed > item.quoted_wait_minutes;

  return (
    <View
      className={`mb-2 rounded-xl overflow-hidden border ${
        isActive
          ? "border-blue-500"
          : isOverdue
          ? "border-red-800/50"
          : "border-gray-700"
      }`}
    >
      {/* Main Content */}
      <View className={`p-3 ${isOverdue ? "bg-red-950/30" : "bg-[#2a2a2a]"}`}>
        {/* Top Row: Drag + Party Size + Name */}
        <View className="flex-row items-center gap-2">
          <GestureDetector
            gesture={Gesture.LongPress().onStart(() => {
              if (drag) drag();
            })}
          >
            <TouchableOpacity onPressIn={drag} className="p-1">
              <GripVertical size={16} color="#6B7280" />
            </TouchableOpacity>
          </GestureDetector>

          {/* Party Size Badge */}
          <View
            className={`w-9 h-9 rounded-full items-center justify-center ${
              isOverdue ? "bg-red-900/50" : "bg-blue-900/50"
            }`}
          >
            <Text
              className={`font-bold text-base ${
                isOverdue ? "text-red-300" : "text-blue-300"
              }`}
            >
              {item.party_size}
            </Text>
          </View>

          {/* Party Name & Time */}
          <View className="flex-1 min-w-0">
            <Text
              className="text-white font-semibold text-base"
              numberOfLines={1}
            >
              {item.party_name}
            </Text>
            <View className="flex-row items-center gap-1 mt-0.5">
              <Clock size={10} color="#9CA3AF" />
              <Text className="text-gray-400 text-xs" numberOfLines={1}>
                {item.quoted_wait_minutes}m / {elapsed}m
              </Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {item.notes ? (
          <Text
            className="text-gray-500 text-xs italic mt-1 ml-12"
            numberOfLines={1}
          >
            "{item.notes}"
          </Text>
        ) : null}

        {/* Bottom Row: Status + Actions */}
        <View className="flex-row items-center justify-between mt-3">
          {/* Status Badge */}
          <View
            className={`flex-row items-center gap-1 px-2 py-1 rounded-full ${
              isOverdue ? "bg-red-900/50" : "bg-green-900/50"
            }`}
          >
            {isOverdue ? (
              <AlertTriangle size={12} color="#F87171" />
            ) : (
              <Check size={12} color="#4ADE80" />
            )}
            <Text
              className={`text-xs font-bold ${
                isOverdue ? "text-red-400" : "text-green-400"
              }`}
            >
              {isOverdue ? "LATE" : "OK"}
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row items-center gap-1">
            <TouchableOpacity
              onPress={onSeat}
              className="flex-row items-center gap-1 px-3 py-1.5 bg-blue-600 rounded-lg"
            >
              <Check size={14} color="white" />
              <Text className="text-white font-semibold text-sm">Seat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDelete}
              className="p-1.5 bg-red-600/20 rounded-lg"
            >
              <Trash2 size={16} color="#F87171" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const WaitlistPanel: React.FC = () => {
  const {
    waitlist,
    isLoading,
    fetchWaitlist,
    addToWaitlistAsync,
    removeFromWaitlistAsync,
    seatFromWaitlistAsync,
    removeWaitlistEntry,
  } = useWaitlistStore();
  const { startNewOrder, setActiveOrder } = useOrderStore();
  const { tables } = useFloorPlanStore();
  const { selectedStore } = useStoreSettingsStore();
  const router = useRouter();

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [selectedWaitlistEntry, setSelectedWaitlistEntry] =
    useState<DBWaitlistEntry | null>(null);
  const [isTablePickerOpen, setTablePickerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DBWaitlistEntry | null>(
    null
  );

  // Fetch waitlist on mount
  useEffect(() => {
    if (selectedStore?.id) {
      fetchWaitlist(selectedStore.id);
    }
  }, [selectedStore?.id]);

  const handleAddEntry = async (data: {
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
    setAddModalOpen(false);
  };

  const handleSelectTable = async (table: FloorPlanObject) => {
    if (!selectedWaitlistEntry) return;

    // Try backend-first approach
    const result = await seatFromWaitlistAsync(selectedWaitlistEntry.id, [
      table.id,
    ]);

    if (result?.order_id) {
      // Backend handled everything, use returned order
      setActiveOrder(result.order_id);
    } else {
      // Fallback: Create order locally
      const newOrder = startNewOrder({
        guestCount: selectedWaitlistEntry.party_size,
        tableId: table.id,
      });
      setActiveOrder(newOrder.id);
    }

    // Navigate to table
    router.push(`/tables/${table.id}`);

    setTablePickerOpen(false);
    setSelectedWaitlistEntry(null);
  };

  const confirmDelete = async () => {
    if (itemToDelete) {
      await removeFromWaitlistAsync(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  return (
    <View className="flex-1 bg-[#1a1a1a] w-full h-full">
      {/* Header */}
      <View className="p-4 border-b border-gray-800 flex-row justify-between items-center bg-[#242424]">
        <View>
          <Text className="text-xl font-bold text-white">Waitlist</Text>
          <Text className="text-gray-500 text-sm">
            {waitlist.length} {waitlist.length === 1 ? "party" : "parties"}{" "}
            waiting
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
          className="bg-blue-600 p-3 rounded-xl flex-row items-center gap-2"
        >
          <UserPlus size={20} color="white" />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View className="flex-1">
        {isLoading && waitlist.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color="#3B82F6" />
            <Text className="text-gray-500 mt-3">Loading waitlist...</Text>
          </View>
        ) : waitlist.length > 0 ? (
          <FlatList
            data={waitlist}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <WaitlistItem
                item={item}
                onSeat={() => {
                  setSelectedWaitlistEntry(item);
                  setTablePickerOpen(true);
                }}
                onDelete={() => setItemToDelete(item)}
              />
            )}
            contentContainerStyle={{ padding: 12 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Clock size={48} color="#4B5563" />
            <Text className="text-gray-500 text-lg mt-4">
              No parties waiting
            </Text>
            <Text className="text-gray-600 text-sm mt-1">
              Tap + to add someone to the waitlist
            </Text>
          </View>
        )}
      </View>

      {/* Modals */}
      <AddWaitlistEntryModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddEntry}
        isLoading={isLoading}
      />

      {selectedWaitlistEntry && (
        <TablePickerModal
          isOpen={isTablePickerOpen}
          onClose={() => setTablePickerOpen(false)}
          onSelectTable={handleSelectTable}
          waitlistEntry={selectedWaitlistEntry}
        />
      )}

      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title="Remove from Waitlist?"
        description={`Are you sure you want to remove ${itemToDelete?.party_name} from the waitlist?`}
        confirmText="Remove"
        variant="destructive"
      />
    </View>
  );
};

export default WaitlistPanel;
