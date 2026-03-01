import React, { useCallback, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { Check, Search, X } from "lucide-react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";

interface ServerSelectSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fullName: string) => void;
  currentServer?: string | null;
}

const ServerSelectSheet: React.FC<ServerSelectSheetProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentServer,
}) => {
  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["60%", "85%"], []);
  const [search, setSearch] = useState("");

  const employees = useEmployeeStore((s) => s.employees);

  const clockedInEmployees = useMemo(() => {
    const filtered = employees.filter((e) => e.shiftStatus === "clocked_in");
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter((e) => e.fullName.toLowerCase().includes(q));
  }, [employees, search]);

  const handleSelect = useCallback(
    (fullName: string) => {
      onSelect(fullName);
      setSearch("");
    },
    [onSelect]
  );

  const handleClose = useCallback(() => {
    setSearch("");
    onClose();
  }, [onClose]);

  // Sync open/close state with the sheet ref
  React.useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand();
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof clockedInEmployees)[0] }) => {
      const isSelected =
        currentServer?.toLowerCase() === item.fullName.toLowerCase();

      return (
        <TouchableOpacity
          onPress={() => handleSelect(item.fullName)}
          activeOpacity={0.7}
          className="flex-row items-center px-4 py-3 border-b border-gray-700/30"
        >
          {/* Avatar circle */}
          <View className="w-9 h-9 rounded-full bg-blue-500/20 items-center justify-center mr-3">
            <Text className="text-blue-400 text-sm font-bold">
              {item.fullName.charAt(0).toUpperCase()}
            </Text>
          </View>

          {/* Name + role */}
          <View className="flex-1">
            <Text className="text-white text-sm font-medium">
              {item.fullName}
            </Text>
            {item.role && (
              <Text className="text-gray-400 text-xs mt-0.5 capitalize">
                {item.role}
              </Text>
            )}
          </View>

          {/* Checkmark if selected */}
          {isSelected && <Check color={colors.teal} size={20} />}
        </TouchableOpacity>
      );
    },
    [currentServer, handleSelect]
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      {...bottomSheetTheme}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView className="flex-1 bg-panel">
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-3 border-b border-gray-700/50">
          <Text className="text-white text-base font-semibold">
            Assign Server
          </Text>
          <TouchableOpacity onPress={handleClose} className="p-1">
            <X color={colors.muted} size={20} />
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View className="flex-row items-center mx-4 my-3 px-3 py-2 bg-surface rounded-lg border border-gray-700">
          <Search color={colors.muted} size={16} />
          <BottomSheetTextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search employees..."
            placeholderTextColor={colors.muted}
            className="flex-1 text-white text-sm ml-2 p-0"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X color={colors.muted} size={14} />
            </TouchableOpacity>
          )}
        </View>

        {/* Employee list */}
        <BottomSheetFlatList
          data={clockedInEmployees}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View className="items-center py-8">
              <Text className="text-gray-500 text-sm">
                {search
                  ? "No matching employees found"
                  : "No clocked-in employees"}
              </Text>
            </View>
          }
        />
      </BottomSheetView>
    </BottomSheet>
  );
};

export default ServerSelectSheet;
