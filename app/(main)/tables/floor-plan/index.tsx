import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { Href, useRouter } from "expo-router";
import { Edit, Plus, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Reusable component for the modal to add/edit a layout name
const LayoutNameModal = ({
  isOpen,
  onClose,
  onSave,
  initialName = "",
  title,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  initialName?: string;
  title: string;
}) => {
  const [name, setName] = useState(initialName);

  React.useEffect(() => {
    if (isOpen) {
      setName(initialName);
    }
  }, [isOpen, initialName]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim());
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#303030] border-gray-700 w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-white text-3xl">{title}</DialogTitle>
        </DialogHeader>
        <View className="py-4">
          <Text className="text-2xl text-gray-300 font-medium mb-2">
            Room Name
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g., Main Dining, Patio"
            placeholderTextColor="#9CA3AF"
            className="p-4 bg-[#212121] border border-gray-600 rounded-lg text-2xl text-white"
            autoFocus
          />
        </View>
        <DialogFooter className="flex-row gap-3">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-4 bg-[#212121] border border-gray-600 rounded-lg"
          >
            <Text className="text-center text-2xl font-bold text-gray-300">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="flex-1 py-4 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-2xl font-bold text-white">
              Save
            </Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const FloorPlanManagementScreen = () => {
  const router = useRouter();
  const { layouts, addLayout, updateLayoutName, deleteLayout } =
    useFloorPlanStore();

  const [isAddModalOpen, setAddModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedLayout, setSelectedLayout] = useState<
    (typeof layouts)[0] | null
  >(null);

  const handleAddNewLayout = (name: string) => {
    addLayout(name);
  };

  const handleEditLayout = (name: string) => {
    if (selectedLayout) {
      updateLayoutName(selectedLayout.id, name);
    }
  };

  const handleDeleteLayout = () => {
    if (selectedLayout) {
      deleteLayout(selectedLayout.id);
      setDeleteModalOpen(false);
      setSelectedLayout(null);
    }
  };

  return (
    <View className="flex-1 p-6 bg-[#212121]">
      <View className="flex-row justify-between items-center mb-6">
        <Text className="text-3xl font-bold text-white"></Text>
        <TouchableOpacity
          onPress={() => setAddModalOpen(true)}
          className="py-4 px-6 bg-blue-600 rounded-lg flex-row items-center"
        >
          <Plus color="white" size={24} className="mr-2" />
          <Text className="text-2xl font-bold text-white">Add New Room</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={layouts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() =>
              router.push(`/tables/edit-layout?layoutId=${item.id}` as Href)
            }
            className="flex-row items-center p-6 bg-[#303030] border border-gray-700 rounded-xl mb-4"
          >
            <View className="flex-1">
              <Text className="text-2xl font-semibold text-white">
                {item.name}
              </Text>
              <Text className="text-xl text-gray-400 mt-1">
                {item.tables.length} tables
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation(); // Prevent navigating
                  setSelectedLayout(item);
                  setEditModalOpen(true);
                }}
                className="p-3 bg-[#212121] rounded-lg border border-gray-600"
              >
                <Edit size={24} color="#9CA3AF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation(); // Prevent navigating
                  setSelectedLayout(item);
                  setDeleteModalOpen(true);
                }}
                className="p-3 bg-red-900/30 rounded-lg border border-red-500"
              >
                <Trash2 size={24} color="#F87171" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View className="items-center justify-center p-10">
            <Text className="text-2xl text-gray-500">No layouts found.</Text>
            <Text className="text-xl text-gray-600 mt-2">
              Click "Add New Room" to get started.
            </Text>
          </View>
        }
      />

      {/* Modals */}
      <LayoutNameModal
        isOpen={isAddModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddNewLayout}
        title="Add New Room"
      />
      <LayoutNameModal
        isOpen={isEditModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={handleEditLayout}
        title="Edit Room Name"
        initialName={selectedLayout?.name || ""}
      />
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        onConfirm={handleDeleteLayout}
        title="Delete Layout"
        description={`Are you sure you want to permanently delete the "${selectedLayout?.name}" layout? All tables within it will be removed.`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default FloorPlanManagementScreen;
