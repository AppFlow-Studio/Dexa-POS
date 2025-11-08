import { Shift } from "@/lib/types";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { useScheduleStore } from "@/stores/useScheduleStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { format, parseISO } from "date-fns";
import {
  ArrowLeft,
  ArrowRightLeft,
  Clock,
  MapPin,
  User,
  X,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type SwapProposalWizardProps = {
  shiftToOffer: Shift | null;
  onClose: () => void;
  bottomSheetRef: React.RefObject<BottomSheet>;
};

const ShiftInfoCard = ({
  shift,
  isSelected,
}: {
  shift?: Shift | null;
  isSelected?: boolean;
}) => {
  if (!shift) {
    return null;
  }

  return (
    <View
      className={`p-4 bg-[#212121] rounded-xl border ${isSelected ? "border-blue-500" : "border-gray-700"}`}
    >
      <Text className="text-base font-semibold text-white mb-1">
        {shift.role}
      </Text>
      <Text className="text-sm text-gray-400 mb-2">
        {format(parseISO(shift.date), "EEEE, MMM d")}
      </Text>
      <View className="flex-row gap-4">
        <View className="flex-row items-center gap-2">
          <Clock size={16} color="#9CA3AF" />
          <Text className="text-sm text-gray-400">
            {format(parseISO(shift.startTime), "h:mm a")} -{" "}
            {format(parseISO(shift.endTime), "h:mm a")}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          <MapPin size={16} color="#9CA3AF" />
          <Text className="text-sm text-gray-400">{shift.location}</Text>
        </View>
      </View>
    </View>
  );
};

export default function SwapProposalWizard({
  shiftToOffer,
  onClose,
  bottomSheetRef,
}: SwapProposalWizardProps) {
  const [compatiblePeers, setCompatiblePeers] = useState<
    Array<{ employee: EmployeeProfile; swappableShiftsCount: number }>
  >([]);
  const [selectedPeer, setSelectedPeer] = useState<EmployeeProfile | null>(
    null
  );
  const [swappablePeerShifts, setSwappablePeerShifts] = useState<Shift[]>([]);
  const [selectedPeerShift, setSelectedPeerShift] = useState<Shift | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);

  const getCompatiblePeersForSwap = useScheduleStore(
    (state) => state.getCompatiblePeersForSwap
  );
  const getSwappableShiftsForPeer = useScheduleStore(
    (state) => state.getSwappableShiftsForPeer
  );
  const proposeSwap = useScheduleStore((state) => state.proposeSwap);
  const loggedInEmployee = useEmployeeStore((state) => state.loggedInEmployee);

  const snapPoints = useMemo(() => ["75%"], []);

  useEffect(() => {
    if (shiftToOffer) {
      // Reset state when a new shift is offered
      setSelectedPeer(null);
      setSelectedPeerShift(null);
      setIsLoading(true);
      const peers = getCompatiblePeersForSwap(shiftToOffer);
      setCompatiblePeers(peers);
      setIsLoading(false);
    }
  }, [shiftToOffer, getCompatiblePeersForSwap]);

  useEffect(() => {
    if (selectedPeer && loggedInEmployee) {
      setIsLoading(true);
      const shifts = getSwappableShiftsForPeer(
        selectedPeer.id,
        loggedInEmployee.id
      );
      setSwappablePeerShifts(shifts);
      setIsLoading(false);
    } else {
      setSwappablePeerShifts([]);
    }
  }, [selectedPeer, loggedInEmployee, getSwappableShiftsForPeer]);

  const handleSelectPeer = (peer: EmployeeProfile) => {
    setSelectedPeer(peer);
    setSelectedPeerShift(null); // Reset shift selection when peer changes
  };

  const handleSelectPeerShift = (shift: Shift) => {
    setSelectedPeerShift(shift);
  };

  const handleProposeSwap = () => {
    if (shiftToOffer && selectedPeerShift) {
      proposeSwap(shiftToOffer, selectedPeerShift);
      onClose();
    }
  };

  const handleBack = () => {
    if (selectedPeerShift) {
      setSelectedPeerShift(null);
    } else if (selectedPeer) {
      setSelectedPeer(null);
    }
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
      <BottomSheetView className="flex-1 p-4 bg-[#212121]">
        {/* Header */}
        <View className="flex-row items-center justify-between pb-4 border-b border-gray-700">
          <View className="flex-row items-center gap-3">
            {selectedPeer && (
              <TouchableOpacity onPress={handleBack} className="p-1">
                <ArrowLeft size={20} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <Text className="text-xl font-bold text-white">
              Request Shift Swap
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} className="p-1">
            <X size={20} color="#9CA3AF" />
          </TouchableOpacity>
        </View>

        {/* Main Content */}
        <View className="flex-1 flex-row mt-4 gap-4">
          {/* Column 1: Select Peer */}
          <View className="flex-1">
            <Text className="text-lg font-bold text-white mb-4">
              Select a Peer
            </Text>
            {isLoading && !shiftToOffer ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : compatiblePeers.length === 0 ? (
              <Text className="text-gray-400 text-center">
                No compatible peers found.
              </Text>
            ) : (
              <FlatList
                data={compatiblePeers}
                keyExtractor={(item) => item.employee.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    className={`p-4 rounded-lg border mb-3 flex-row justify-between items-center ${selectedPeer?.id === item.employee.id ? "bg-blue-600 border-blue-500" : "bg-[#303030] border-gray-700"}`}
                    onPress={() => handleSelectPeer(item.employee)}
                  >
                    <View className="flex-row items-center gap-3">
                      <User
                        size={20}
                        color={
                          selectedPeer?.id === item.employee.id
                            ? "#FFFFFF"
                            : "#9CA3AF"
                        }
                      />
                      <Text
                        className={`font-semibold ${selectedPeer?.id === item.employee.id ? "text-white" : "text-gray-300"}`}
                      >
                        {item.employee.fullName}
                      </Text>
                    </View>
                    <Text
                      className={`text-sm ${selectedPeer?.id === item.employee.id ? "text-blue-200" : "text-gray-400"}`}
                    >
                      {item.swappableShiftsCount} shifts
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Column 2: Select Shift */}
          {selectedPeer && (
            <View className="flex-1 border-l border-gray-700 pl-4">
              <Text className="text-lg font-bold text-white mb-4">
                Select {selectedPeer.fullName}'s Shift
              </Text>
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : swappablePeerShifts.length === 0 ? (
                <Text className="text-gray-400 text-center">
                  No swappable shifts found.
                </Text>
              ) : (
                <FlatList
                  data={swappablePeerShifts}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => handleSelectPeerShift(item)}
                      className="mb-3"
                    >
                      <ShiftInfoCard
                        shift={item}
                        isSelected={selectedPeerShift?.id === item.id}
                      />
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          )}

          {/* Column 3: Confirm */}
          {selectedPeerShift && (
            <View className="flex-1 border-l border-gray-700 pl-4">
              <Text className="text-lg font-bold text-white mb-4">
                Confirm Proposal
              </Text>
              <Text className="text-gray-400 font-semibold mb-2">
                You are offering:
              </Text>
              <ShiftInfoCard shift={shiftToOffer} />
              <View className="items-center my-4">
                <ArrowRightLeft size={24} color="#3b82f6" />
              </View>
              <Text className="text-gray-400 font-semibold mb-2">
                In exchange for:
              </Text>
              <ShiftInfoCard shift={selectedPeerShift} />
              <TouchableOpacity
                onPress={handleProposeSwap}
                className="mt-4 py-3 bg-blue-600 rounded-lg items-center"
              >
                <Text className="font-bold text-white">Send Swap Proposal</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
