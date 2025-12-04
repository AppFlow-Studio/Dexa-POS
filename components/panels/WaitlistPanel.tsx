import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { TableType, WaitlistEntry } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useWaitlistStore } from "@/stores/useWaitlistStore";
import { useRouter } from "expo-router";
import {
  Check,
  Clock,
  GripVertical,
  MessageCircle,
  Trash2,
  Users,
  X,
} from "lucide-react-native";
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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
            <TextInput
              placeholder="Name"
              placeholderTextColor="#9CA3AF"
              value={name}
              onChangeText={setName}
              className="w-full p-3 mb-3 bg-[#212121] border border-gray-600 text-white rounded-lg"
            />
            <TextInput
              placeholder="Party Size"
              placeholderTextColor="#9CA3AF"
              value={partySize}
              onChangeText={(text) => setPartySize(text.replace(/[^0-9]/g, ""))}
              keyboardType="numeric"
              className="w-full p-3 mb-3 bg-[#212121] border border-gray-600 text-white rounded-lg"
            />
            <TextInput
              placeholder="Quoted Time (min)"
              placeholderTextColor="#9CA3AF"
              value={quotedTime}
              onChangeText={(text) =>
                setQuotedTime(text.replace(/[^0-9]/g, ""))
              }
              keyboardType="numeric"
              className="w-full p-3 mb-3 bg-[#212121] border border-gray-600 text-white rounded-lg"
            />
            <TextInput
              placeholder="Notes (e.g., anniversary, high chair)"
              placeholderTextColor="#9CA3AF"
              value={notes}
              onChangeText={setNotes}
              multiline
              className="w-full p-3 mb-4 bg-[#212121] border border-gray-600 text-white rounded-lg h-20"
            />
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 py-3 bg-[#212121] border border-gray-600 rounded-lg"
              >
                <Text className="text-center text-xl font-bold text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSubmit}
                className="flex-1 py-3 bg-blue-600 rounded-lg"
              >
                <Text className="text-center text-xl font-bold text-white">
                  Add Entry
                </Text>
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
  onSelectTable: (table: TableType) => void;
  partySize: number;
}> = ({ isOpen, onClose, onSelectTable, partySize }) => {
  const { layouts } = useFloorPlanStore();
  const availableTables = useMemo(() => {
    return layouts
      .flatMap((l) => l.tables)
      .filter((t) => t.status === "Available" && t.capacity >= partySize);
  }, [layouts, partySize]);

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={isOpen}
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-center items-center bg-black/70"
        onPress={onClose}
      >
        <View className="bg-[#303030] border-gray-700 w-[450px] p-6 rounded-lg">
          <Text className="text-xl font-bold text-white mb-4">
            Select an Available Table
          </Text>
          <FlatList
            data={availableTables}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => onSelectTable(item)}
                className="w-full p-3 mb-2 bg-gray-700 rounded-lg"
              >
                <Text className="text-white text-center">
                  {item.name} (Capacity: {item.capacity})
                </Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text className="text-gray-400 text-center">
                No suitable tables available.
              </Text>
            }
          />
        </View>
      </Pressable>
    </Modal>
  );
};

const DELETE_BUTTON_WIDTH = 90;

// Waitlist Card Component
const WaitlistCard = ({
  item,
  onSeat,
  onDelete,
}: {
  item: WaitlistEntry;
  onSeat: () => void;
  onDelete: () => void;
}) => {
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      const next = Math.max(-DELETE_BUTTON_WIDTH, Math.min(0, e.translationX));
      translateX.value = next;
    })
    .onEnd(() => {
      const shouldOpen = translateX.value < -DELETE_BUTTON_WIDTH / 2;
      translateX.value = withTiming(shouldOpen ? -DELETE_BUTTON_WIDTH : 0);
    })
    .activeOffsetX([-20, 20])
    .failOffsetY([-20, 20]);

  const handleDelete = () => {
    onDelete();
    translateX.value = withTiming(0);
  };

  return (
    <View className="rounded-xl overflow-hidden bg-[#303030] border-gray-700 mb-3">
      <View className="absolute top-0 right-1 h-full justify-center items-end self-center z-10">
        <TouchableOpacity
          onPress={handleDelete}
          className="w-20 h-[85%] bg-red-500 items-center rounded-lg justify-center"
        >
          <Trash2 color="white" size={20} />
        </TouchableOpacity>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={animatedStyle} className="bg-[#212121] z-20">
          <TouchableOpacity
            className={`p-3 rounded-xl border border-gray-700 bg-gray-800`}
          >
            <View className="flex flex-row items-start gap-3">
              <TouchableOpacity className="mt-1 text-gray-400">
                <GripVertical size={20} color="#9CA3AF" />
              </TouchableOpacity>
              <View className="flex-1">
                <View className="flex flex-row justify-between items-start mb-1">
                  <Text className="font-bold text-white text-lg">
                    {item.name}
                  </Text>
                  <Text
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      item.quotedTime > 20
                        ? "bg-orange-500/20 text-orange-400"
                        : "bg-gray-700 text-gray-300"
                    }`}
                  >
                    {item.quotedTime}m
                  </Text>
                </View>
                <View className="flex flex-row items-center gap-4 text-xs text-gray-400 mb-2">
                  <View className="flex flex-row items-center gap-1">
                    <Users size={14} color="#9CA3AF" />
                    <Text className="text-gray-300">{item.partySize}</Text>
                  </View>
                  <View className="flex flex-row items-center gap-1">
                    <Clock size={14} color="#9CA3AF" />
                    <Text className="text-gray-300">
                      {item.arrivalTime.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </View>
                </View>
                {item.notes && (
                  <Text className="text-sm text-gray-400 bg-gray-700/50 p-2 rounded-md mb-2">
                    {item.notes}
                  </Text>
                )}
                <View className="flex flex-row justify-end items-center gap-2">
                  <TouchableOpacity className="p-2 rounded-full hover:bg-blue-900/40">
                    <MessageCircle size={18} color="#60A5FA" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={onSeat}
                    className="flex-row items-center bg-green-600 px-3 py-2 rounded-lg"
                  >
                    <Check size={16} color="white" />
                    <Text className="text-white font-bold ml-1">Seat</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const WaitlistPanel = () => {
  const { waitlist, reorderWaitlist, addToWaitlist, removeWaitlistEntry } =
    useWaitlistStore();
  const { orders, startNewOrder, setActiveOrder, updateActiveOrderDetails } =
    useOrderStore();
  const { layouts, updateTableStatus } = useFloorPlanStore();
  const { employees, activeEmployeeId } = useEmployeeStore();
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const router = useRouter();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTablePickerOpen, setIsTablePickerOpen] = useState(false);
  const [selectedWaitlistEntry, setSelectedWaitlistEntry] =
    useState<WaitlistEntry | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null);

  const handleAddEntry = (data: {
    name: string;
    partySize: number;
    quotedTime: number;
    notes: string;
    phone?: string;
  }) => {
    addToWaitlist(data);
    setIsAddModalOpen(false);
  };

  const handleOpenTablePicker = (entry: WaitlistEntry) => {
    setSelectedWaitlistEntry(entry);
    setIsTablePickerOpen(true);
  };

  const handleSelectTable = (table: TableType) => {
    if (!selectedWaitlistEntry) return;

    const server = employees.find((e) => e.id === activeEmployeeId);

    const newOrder = startNewOrder({
      tableId: table.id,
      guestCount: selectedWaitlistEntry.partySize,
    });

    setActiveOrder(newOrder.id);

    updateActiveOrderDetails({
      customer_name: selectedWaitlistEntry.name,
      server_name: server?.fullName || "Unassigned",
      opened_at: new Date().toISOString(),
    });

    updateTableStatus(table.id, "In Use");
    removeWaitlistEntry(selectedWaitlistEntry.id);
    setIsTablePickerOpen(false);

    router.push(`/tables/${table.id}`);
  };

  const handleDeletePress = (item: WaitlistEntry) => {
    setItemToDelete(item);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = () => {
    if (itemToDelete) {
      removeWaitlistEntry(itemToDelete.id);
    }
    setIsDeleteModalOpen(false);
    setItemToDelete(null);
  };

  const tableSuggestion = useMemo(() => {
    if (waitlist.length === 0) return null;
    const nextParty = waitlist[0];

    const seatedTables = layouts
      .flatMap((l) => l.tables)
      .filter((t) => t.status === "In Use");

    let bestSuggestion: { tableName: string; minutesRemaining: number } | null =
      null;

    for (const table of seatedTables) {
      const order = orders.find((o) => o.service_location_id === table.id);
      if (order?.opened_at) {
        const seatedTime = new Date(order.opened_at).getTime();
        const estimatedEndTime =
          seatedTime + defaultSittingTimeMinutes * 60 * 1000;
        const now = new Date().getTime();

        if (estimatedEndTime > now) {
          const minutesRemaining = Math.round(
            (estimatedEndTime - now) / (60 * 1000)
          );
          if (table.capacity >= nextParty.partySize) {
            if (
              !bestSuggestion ||
              minutesRemaining < bestSuggestion.minutesRemaining
            ) {
              bestSuggestion = { tableName: table.name, minutesRemaining };
            }
          }
        }
      }
    }

    if (bestSuggestion) {
      return `Table ${bestSuggestion.tableName} opens in ${bestSuggestion.minutesRemaining} min - Good fit for ${nextParty.name}`;
    }

    return null;
  }, [waitlist, layouts, orders, defaultSittingTimeMinutes]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View className="h-full flex-col bg-[#292929]">
        <View className="p-4 border-b border-gray-700">
          <TouchableOpacity
            onPress={() => setIsAddModalOpen(true)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-sm py-3 rounded-lg flex items-center justify-center"
          >
            <Text className="text-white font-bold text-base">
              Add to Waitlist
            </Text>
          </TouchableOpacity>
        </View>

        {tableSuggestion && (
          <View className="p-4 bg-emerald-900/30 border-b border-emerald-500/30">
            <Text className="text-xs font-medium text-emerald-400 flex items-center gap-2">
              <Text className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-2" />
              {tableSuggestion}
            </Text>
          </View>
        )}

        <FlatList
          data={waitlist}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <WaitlistCard
              item={item}
              onSeat={() => handleOpenTablePicker(item)}
              onDelete={() => handleDeletePress(item)}
            />
          )}
          contentContainerStyle={{ padding: 12 }}
        />
      </View>

      <AddWaitlistEntryModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSubmit={handleAddEntry}
      />
      {selectedWaitlistEntry && (
        <TablePickerModal
          isOpen={isTablePickerOpen}
          onClose={() => setIsTablePickerOpen(false)}
          onSelectTable={handleSelectTable}
          partySize={selectedWaitlistEntry.partySize}
        />
      )}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Waitlist Entry"
        description={`Are you sure you want to remove ${itemToDelete?.name} from the waitlist? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />
    </GestureHandlerRootView>
  );
};

export default WaitlistPanel;
