import { Shift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface RequestSwapSheetProps {
  shift: Shift | null;
  bottomSheetRef: React.RefObject<BottomSheet>;
  onClose: () => void;
}

const RequestSwapBottomSheet: React.FC<RequestSwapSheetProps> = ({
  shift,
  bottomSheetRef,
  onClose,
}) => {
  const { addSwapRequest } = useScheduleStore();
  const { employees } = useEmployeeStore();

  // Simulate finding compatible employees
  const compatibleEmployees = employees.slice(0, 3);

  const snapPoints = useMemo(() => ["50%", "75%"], []);

  if (!shift) return null;

  const handleSendRequest = (employeeId: string) => {
    addSwapRequest({
      shift,
      status: "pending",
      submittedAt: new Date().toISOString(),
      direction: "outgoing",
      theirShift: shift, // Placeholder for actual swap logic
    });
    toast.success("Swap request sent.", { position: ToastPosition.BOTTOM });
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
          Request to Swap Shift
        </Text>
        <Text className="text-gray-300 mb-3">
          Select a compatible employee to send a swap request:
        </Text>
        <View className="gap-y-3">
          {compatibleEmployees.map((emp) => (
            <View
              key={emp.id}
              className="p-3 bg-[#303030] border border-gray-600 rounded-lg flex-row justify-between items-center"
            >
              <Text className="text-white font-semibold">{emp.fullName}</Text>
              <TouchableOpacity
                onPress={() => handleSendRequest(emp.id)}
                className="px-3 py-1 bg-blue-600 rounded"
              >
                <Text className="text-white">Send Request</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

export default RequestSwapBottomSheet;
