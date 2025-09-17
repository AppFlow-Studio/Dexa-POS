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
      // Show manager PIN dialog
      setShowManagerPin(true);
    } else {
      setIsTaxExempt(false);
    }
  };

  const handleManagerPinSubmit = () => {
    if (managerPin === "1234") {
      // Default manager PIN
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
    // Show manager PIN dialog for drawer access
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
      // Close the bottom sheet
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
      >
        <BottomSheetView className="flex-1 bg-white rounded-t-3xl overflow-hidden">
          {/* Header */}
          <View className="flex-row justify-between items-center p-6 border-b border-gray-200">
            <Text className="text-3xl font-bold text-gray-800">More</Text>
            <TouchableOpacity
              onPress={() => {
                if (ref && "current" in ref && ref.current) {
                  ref.current.close();
                }
              }}
              className="p-2"
            >
              <X color="#6b7280" size={24} />
            </TouchableOpacity>
          </View>

          {/* Order Notes Section */}
          <View className="p-6">
            <Text className="text-2xl font-semibold text-gray-800 mb-3">
              Order Notes
            </Text>
            <BottomSheetTextInput
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder="Add special instructions..."
              multiline
              numberOfLines={3}
              className="p-4 bg-gray-100 rounded-xl text-2xl min-h-[120px]"
              placeholderTextColor="#6b7280"
              textAlignVertical="top"
            />
          </View>

          {/* Tax Exempt Section */}
          <View className="px-6 pb-6">
            <Text className="text-2xl font-semibold text-gray-800 mb-3">
              Tax Exempt
            </Text>
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-xl text-gray-600">Requires PIN</Text>
              </View>
              <TouchableOpacity
                onPress={handleTaxExemptToggle}
                className={`w-16 h-8 rounded-full flex-row items-center ${
                  isTaxExempt ? "bg-primary-400" : "bg-gray-300"
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
            <Text className="text-2xl font-semibold text-gray-800 mb-3">
              Open Drawer (No-sale)
            </Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-xl text-gray-600 mr-2">Requires PIN</Text>
                <Lock color="#6b7280" size={24} />
              </View>
              <TouchableOpacity
                onPress={handleOpenDrawer}
                className="px-6 py-3 bg-gray-100 rounded-xl"
              >
                <Text className="text-2xl font-medium text-gray-800">Open</Text>
              </TouchableOpacity>
            </View>
          </View>
        </BottomSheetView>
      </BottomSheet>

      {/* Manager PIN Dialog */}
      <Modal
        visible={showManagerPin}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowManagerPin(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/50">
          <View className="bg-white rounded-2xl p-6 w-96">
            <Text className="text-3xl font-bold text-gray-800 mb-4 text-center">
              Manager PIN Required
            </Text>
            <TextInput
              value={managerPin}
              onChangeText={setManagerPin}
              placeholder="Enter PIN"
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              className="p-4 bg-gray-100 rounded-xl text-center text-2xl font-bold mb-4"
              placeholderTextColor="#6b7280"
            />
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => {
                  setShowManagerPin(false);
                  setManagerPin("");
                }}
                className="flex-1 py-4 bg-gray-100 rounded-xl"
              >
                <Text className="text-center text-2xl font-bold text-gray-800">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={
                  isTaxExempt
                    ? handleManagerPinSubmit
                    : handleManagerPinForDrawer
                }
                className="flex-1 py-4 bg-primary-400 rounded-xl"
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
