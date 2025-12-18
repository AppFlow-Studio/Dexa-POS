import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useWaitlistStore } from "@/stores/useWaitlistStore";
import {
  WaitlistEntry as DBWaitlistEntry,
  FloorPlanObject,
} from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import { Check, GripVertical, Trash2, Users, X } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
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
}> = ({ isOpen, onClose, onSubmit }) => {
  const [name, setName] = useState("");
  const [partySize, setPartySize] = useState("");
  const [quotedTime, setQuotedTime] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = () => {
    onSubmit({
      name,
      partySize: parseInt(partySize || "0"),
      quotedTime: parseInt(quotedTime || "0"),
      notes,
    });
    setName("");
    setPartySize("");
    setQuotedTime("");
    setNotes("");
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
          className="flex-1 justify-center items-center"
          onPress={onClose}
        >
          <Pressable className="bg-[#303030] border-gray-700 w-[450px] p-6 rounded-lg">
            <View className="flex-row justify-between items-center w-full mb-4">
              <Text className="text-white text-2xl font-semibold">
                Add to Waitlist
              </Text>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View className="space-y-4">
              <View>
                <Text className="text-gray-400 mb-1">Guest Name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Enter name"
                  placeholderTextColor="#6B7280"
                  className="bg-[#212121] text-white p-3 rounded-md border border-gray-600"
                />
              </View>

              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-gray-400 mb-1">Party Size</Text>
                  <TextInput
                    value={partySize}
                    onChangeText={setPartySize}
                    keyboardType="numeric"
                    placeholder="2"
                    placeholderTextColor="#6B7280"
                    className="bg-[#212121] text-white p-3 rounded-md border border-gray-600"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-gray-400 mb-1">Quoted Time (min)</Text>
                  <TextInput
                    value={quotedTime}
                    onChangeText={setQuotedTime}
                    keyboardType="numeric"
                    placeholder="15"
                    placeholderTextColor="#6B7280"
                    className="bg-[#212121] text-white p-3 rounded-md border border-gray-600"
                  />
                </View>
              </View>

              <View>
                <Text className="text-gray-400 mb-1">Notes (Optional)</Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Special requests..."
                  placeholderTextColor="#6B7280"
                  className="bg-[#212121] text-white p-3 rounded-md border border-gray-600 h-20"
                  multiline
                />
              </View>

              <TouchableOpacity
                onPress={handleSubmit}
                className="bg-blue-600 p-4 rounded-md items-center mt-2"
              >
                <Text className="text-white font-bold text-lg">Add Party</Text>
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
  // Use FloorPlanObject
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
  // Match capacity
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
            Party Size: {waitlistEntry?.party_size} • Quoted:{" "}
            {waitlistEntry?.quoted_wait_minutes}m
          </Text>

          <Text className="text-blue-400 font-semibold mb-3 uppercase text-xs tracking-wider">
            Recommended Tables
          </Text>
          <FlatList
            data={recommendedTables}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelectTable(item)}
                className="bg-[#212121] p-4 rounded-lg mb-2 flex-row justify-between items-center border border-gray-700"
              >
                <View>
                  <Text className="text-white text-lg font-semibold">
                    {item.name}
                  </Text>
                  <Text className="text-gray-400">
                    Capacity: {item.capacity}
                  </Text>
                </View>
                <View className="bg-green-600/20 px-3 py-1 rounded-full">
                  <Text className="text-green-400 font-medium">Select</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text className="text-gray-500 italic p-2">
                No tables match size requirements.
              </Text>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const WaitlistPanel: React.FC = () => {
  const { waitlist, addToWaitlist, reorderWaitlist, removeWaitlistEntry } =
    useWaitlistStore();
  const { startNewOrder, setActiveOrder } = useOrderStore();
  // updateTableStatus from FloorPlanStore removed. OrderStore handles logic.
  const { tables } = useFloorPlanStore();
  const router = useRouter();

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [selectedWaitlistEntry, setSelectedWaitlistEntry] =
    useState<DBWaitlistEntry | null>(null);
  const [isTablePickerOpen, setTablePickerOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<DBWaitlistEntry | null>(
    null
  );

  const handleAddEntry = (data: {
    name: string;
    partySize: number;
    quotedTime: number;
    notes: string;
  }) => {
    addToWaitlist({
      location_id: "loc_demo", // Or fetch from store
      party_name: data.name,
      party_size: data.partySize,
      quoted_wait_minutes: data.quotedTime,
      notes: data.notes,
    });
    setAddModalOpen(false);
  };

  const handleSelectTable = (table: FloorPlanObject) => {
    if (!selectedWaitlistEntry) return;

    // 1. Create Order / Assign Table
    // Existing logic assumes 'startNewOrder' handles it.
    // We pass guest count and table ID.
    const newOrder = startNewOrder({
      guestCount: selectedWaitlistEntry.party_size,
      tableId: table.id,
    });

    // Set active order
    setActiveOrder(newOrder.id);

    // 2. Remove from waitlist
    removeWaitlistEntry(selectedWaitlistEntry.id);

    // 3. Mark Table as In Use -> Handled by OrderStore integration implicitly when order added

    // 4. Navigate
    router.push(`/tables/${table.id}`);

    setTablePickerOpen(false);
    setSelectedWaitlistEntry(null);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      removeWaitlistEntry(itemToDelete.id);
      setItemToDelete(null);
    }
  };

  const RenderWaitlistItem = ({
    item,
    drag,
    isActive,
  }: {
    item: DBWaitlistEntry;
    drag?: () => void;
    isActive?: boolean;
  }) => {
    const elapsed = Math.floor(
      (new Date().getTime() - new Date(item.created_at).getTime()) / 60000
    );
    const isOverdue = elapsed > item.quoted_wait_minutes;

    return (
      <View
        className={`bg-[#333] mb-2 rounded-lg p-3 flex-row items-center justify-between border ${
          isActive ? "border-blue-500 bg-[#404040]" : "border-gray-700"
        }`}
      >
        <View className="flex-row items-center gap-3 flex-1">
          <GestureDetector
            gesture={Gesture.LongPress().onStart(() => {
              if (drag) drag();
            })}
          >
            <TouchableOpacity onPressIn={drag} className="p-2">
              <GripVertical size={20} color="#6B7280" />
            </TouchableOpacity>
          </GestureDetector>

          <View className="w-10 h-10 bg-gray-700 rounded-full items-center justify-center">
            <Text className="text-white font-bold text-lg">
              {item.party_size}
            </Text>
          </View>
          <View>
            <Text className="text-white font-semibold text-lg">
              {item.party_name}
            </Text>
            <Text className="text-gray-400 text-xs">
              Quoted: {item.quoted_wait_minutes}m • Waited: {elapsed}m
            </Text>
            {item.notes ? (
              <Text className="text-gray-500 text-xs italic" numberOfLines={1}>
                {item.notes}
              </Text>
            ) : null}
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <View
            className={`px-2 py-1 rounded-full ${
              isOverdue ? "bg-red-900/50" : "bg-green-900/50"
            }`}
          >
            <Text
              className={`text-xs font-bold ${
                isOverdue ? "text-red-400" : "text-green-400"
              }`}
            >
              {isOverdue ? "OVERDUE" : "ON TIME"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => {
              setSelectedWaitlistEntry(item);
              setTablePickerOpen(true);
            }}
            className="p-2 bg-blue-600 rounded-md"
          >
            <Check size={18} color="white" />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setItemToDelete(item)}
            className="p-2 bg-red-600/20 rounded-md"
          >
            <Trash2 size={18} color="#F87171" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-[#292929] w-full h-full">
      <View className="p-4 border-b border-gray-700 flex-row justify-between items-center bg-[#292929]">
        <View>
          <Text className="text-xl font-bold text-white">Waitlist</Text>
          <Text className="text-gray-400 text-sm">
            {waitlist.length} parties waiting
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
          className="bg-blue-600 p-2 rounded-full"
        >
          <Users size={20} color="white" />
        </TouchableOpacity>
      </View>

      <View className="flex-1 bg-[#292929]">
        {waitlist.length > 0 ? (
          <FlatList
            data={waitlist}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <RenderWaitlistItem item={item} />}
            contentContainerStyle={{ padding: 12 }}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="text-gray-500 italic">Waitlist is empty</Text>
          </View>
        )}
      </View>

      <AddWaitlistEntryModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSubmit={handleAddEntry}
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
        description={`Are you sure you want to remove ${itemToDelete?.party_name}?`}
        confirmText="Remove"
        variant="destructive"
      />
    </View>
  );
};

export default WaitlistPanel;
