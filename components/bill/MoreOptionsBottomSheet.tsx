import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Lock, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";

const MoreOptionsBottomSheet = forwardRef<BottomSheetMethods>((props, ref) => {
  const snapPoints = useMemo(() => ["75%"], []);
  const [promoCode, setPromoCode] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerPin, setManagerPin] = useState("");

  const handleApplyPromoCode = () => {
    if (promoCode.trim()) {
      toast.success("Promo code applied", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
      setPromoCode("");
    }
  };

  const handleTaxExemptToggle = () => {
    if (!isTaxExempt) {
      setShowManagerPin(true);
    } else {
      setIsTaxExempt(false);
    }
  };

  const handleManagerPinSubmit = () => {
    if (managerPin === "1234") {
      setIsTaxExempt(true);
      setShowManagerPin(false);
      setManagerPin("");
      toast.success("Tax exempt enabled", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
    } else {
      toast.error("Invalid PIN", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
    }
  };

  const handleOpenDrawer = () => {
    setShowManagerPin(true);
  };

  const handleManagerPinForDrawer = () => {
    if (managerPin === "1234") {
      toast.success("Drawer opened", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
      setShowManagerPin(false);
      setManagerPin("");
      if (ref && "current" in ref && ref.current) {
        ref.current.close();
      }
    } else {
      toast.error("Invalid PIN", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
    }
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  return (
    <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        handleComponent={null}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#212121" }} // Dark background for the sheet
      >
        <BottomSheetView className="flex-1 bg-[#212121] rounded-t-3xl overflow-hidden">
          {/* Header */}
          <View className="flex-row justify-between items-center p-6 border-b border-gray-700">
            <Text className="text-3xl font-bold text-white">More</Text>
            <TouchableOpacity
              onPress={() => {
                if (ref && "current" in ref && ref.current) {
                  ref.current.close();
                }
              }}
              className="p-3 bg-[#303030] rounded-full border border-gray-600"
            >
              <X color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </View>

          {/* Order Notes Section */}
          <View className="p-6">
            <Text className="text-2xl font-semibold text-white mb-3">
              Order Notes
            </Text>
            <BottomSheetTextInput
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder="Add special instructions..."
              multiline
              numberOfLines={3}
              className="p-4 bg-[#303030] rounded-xl text-2xl min-h-[120px] text-white border border-gray-600"
              placeholderTextColor="#6B7280"
              textAlignVertical="top"
            />
          </View>

          {/* Tax Exempt Section */}
          <View className="px-6 pb-6">
            <Text className="text-2xl font-semibold text-white mb-3">
              Tax Exempt
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-xl text-gray-400">Requires PIN</Text>
              <TouchableOpacity
                onPress={handleTaxExemptToggle}
                className={`w-16 h-8 rounded-full flex-row items-center ${
                  isTaxExempt ? "bg-blue-600" : "bg-gray-600"
                }`}
              >
                <View
                  className={`w-7 h-7 bg-white rounded-full shadow-sm ${
                    isTaxExempt ? "ml-8" : "ml-0.5"
                  }`}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Open Drawer Section */}
          <View className="px-6 pb-6">
            <Text className="text-2xl font-semibold text-white mb-3">
              Open Drawer (No-sale)
            </Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-xl text-gray-400 mr-2">Requires PIN</Text>
                <Lock color="#9CA3AF" size={24} />
              </View>
              <TouchableOpacity
                onPress={handleOpenDrawer}
                className="px-6 py-3 bg-[#303030] rounded-xl border border-gray-600"
              >
                <Text className="text-2xl font-medium text-white">Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetView>
      </BottomSheet>

      {/* Manager PIN Dialog (already dark-themed, no changes needed) */}
      <Modal
        visible={showManagerPin}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowManagerPin(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60">
          <View className="bg-[#303030] rounded-2xl p-6 w-96 border border-gray-700">
            <Text className="text-3xl font-bold text-white mb-4 text-center">
              Manager PIN Required
            </Text>
            <TextInput
              value={managerPin}
              onChangeText={setManagerPin}
              placeholder="Enter PIN"
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              className="p-4 bg-[#212121] border border-gray-600 rounded-xl text-center text-2xl font-bold mb-4 text-white h-20"
              placeholderTextColor="#6B7280"
            />
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => {
                  setShowManagerPin(false);
                  setManagerPin("");
                }}
                className="flex-1 py-4 bg-[#212121] border border-gray-600 rounded-xl"
              >
                <Text className="text-center text-2xl font-bold text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={
                  isTaxExempt
                    ? handleManagerPinSubmit
                    : handleManagerPinForDrawer
                }
                className="flex-1 py-4 bg-blue-600 rounded-xl"
              >
                <Text className="text-center text-2xl font-bold text-white">
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
});

MoreOptionsBottomSheet.displayName = "MoreOptionsBottomSheet";

export default MoreOptionsBottomSheet;
