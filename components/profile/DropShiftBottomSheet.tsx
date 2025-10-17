import { Shift } from "@/lib/types";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface DropShiftSheetProps {
  shift: Shift | null;
  bottomSheetRef: React.RefObject<BottomSheet>;
  onClose: () => void;
}

const REASONS = ["Sick", "Family Emergency", "Transportation Issue", "Other"];

const DropShiftBottomSheet: React.FC<DropShiftSheetProps> = ({
  shift,
  bottomSheetRef,
  onClose,
}) => {
  const { addDropRequest } = useScheduleStore();
  const [selectedReason, setSelectedReason] = useState("");
  const [note, setNote] = useState("");

  const snapPoints = useMemo(() => ["50%", "60%"], []);

  if (!shift) return null;

  const handleSubmit = () => {
    if (!selectedReason) {
      toast.error("Please select a reason for dropping the shift.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    addDropRequest({
      shift,
      status: "pending",
      submittedAt: new Date().toISOString(),
      note: `${selectedReason}${note ? `: ${note}` : ""}`,
    });
    toast.success("Drop request submitted for manager approval.", {
      position: ToastPosition.BOTTOM,
    });
    onClose();
  };

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
      backgroundStyle={{ backgroundColor: "#212121" }}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
        />
      )}
    >
      <BottomSheetView className="p-4 flex-1">
        <Text className="text-white text-xl font-bold mb-4">
          Request to Drop Shift
        </Text>
        <Text className="text-gray-300 mb-3">
          Select a reason for dropping this shift:
        </Text>
        <View className="flex-row flex-wrap gap-2 mb-4">
          {REASONS.map((reason) => (
            <TouchableOpacity
              key={reason}
              onPress={() => setSelectedReason(reason)}
              className={`px-3 py-2 rounded-lg border ${
                selectedReason === reason
                  ? "bg-blue-600 border-blue-500"
                  : "bg-[#303030] border-gray-600"
              }`}
            >
              <Text
                className={
                  selectedReason === reason ? "text-white" : "text-gray-300"
                }
              >
                {reason}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <BottomSheetTextInput
          value={note}
          onChangeText={setNote}
          placeholder="Add a note (optional)..."
          placeholderTextColor="#6B7280"
          multiline
          className="p-3 bg-[#303030] border border-gray-600 rounded-lg text-white min-h-[80px] mb-4"
        />
        <View className="flex-row gap-2 mt-auto">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 bg-gray-600 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSubmit}
            className="flex-1 py-3 bg-red-600 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Submit Drop Request</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default DropShiftBottomSheet;
