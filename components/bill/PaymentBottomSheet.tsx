import { usePaymentStore } from "@/stores/usePaymentStore";
import { AlertTriangle } from "lucide-react-native";
import React, { useState } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { colors } from "@/lib/theme";
import CardPaymentView from "./ paymentView/CardPaymentView";
import CashPaymentView from "./ paymentView/CashPaymentView";
import ItemsReviewView from "./ paymentView/ItemsReviewView";
import PaymentSuccessView from "./ paymentView/PaymentSuccessView";
import CustomAmountView from "./paymentView/CustomAmountView";
import ManualCardEntryView from "./paymentView/ManualCardEntryView";
import PayForItemsView from "./paymentView/PayForItemsView";
import PaymentMethodSelectionView from "./paymentView/PaymentMethodSelectionView";
import PaymentProgressHeader from "./paymentView/PaymentProgressHeader";
import SplitByItemView from "./paymentView/SplitByItemView";
import SplitEvenlyView from "./paymentView/SplitEvenlyView";
import SplitOptionsView from "./paymentView/SplitOptionsView";
import PreAuthPaymentView from "./paymentView/PreAuthPaymentView";
import SplitPaymentSuccessView from "./SplitPaymentSuccessView";

const PaymentBottomSheet: React.FC = () => {
  const view = usePaymentStore((s) => s.view);
  const isOpen = usePaymentStore((s) => s.isOpen);
  const close = usePaymentStore((s) => s.close);
  const isDirty = usePaymentStore((s) => s.isDirty);
  const setIsDirty = usePaymentStore((s) => s.setIsDirty);
  const handleSuccessClose = usePaymentStore((s) => s.handleSuccessClose);
  const isTransactionProcessing = usePaymentStore(
    (s) => s.isTransactionProcessing
  );
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleConfirmClose = () => {
    setIsDirty(false);
    setShowConfirmation(false);
    close();
  };

  const handleCancelClose = () => {
    setShowConfirmation(false);
  };

  const handleAttemptClose = () => {
    if (isTransactionProcessing) return;
    if (isDirty) {
      setShowConfirmation(true);
    } else if (view === "success") {
      handleSuccessClose();
    } else {
      close();
    }
  };

  const renderContent = () => {
    switch (view) {
      case "review":
        return null;
      case "payment-method-selection":
        return <PaymentMethodSelectionView />;
      case "card":
        return <CardPaymentView />;
      case "manual":
        return <ManualCardEntryView />;
      case "cash":
        return <CashPaymentView />;
      case "split":
        return <SplitOptionsView />;
      case "split-options":
        return <SplitOptionsView />;
      case "split-by-item":
        return <SplitByItemView />;
      case "split-evenly":
        return <SplitEvenlyView />;
      case "split-custom-amount":
        return <CustomAmountView />;
      case "split-payment-success":
        return <SplitPaymentSuccessView />;
      case "pay-for-items":
        return <PayForItemsView />;
      case "pre-auth":
        return <PreAuthPaymentView />;
      case "success":
        return <PaymentSuccessView />;
      default:
        return <Text className="text-white">Unknown View</Text>;
    }
  };

  return (
    <>
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          if (isTransactionProcessing) return;
          handleAttemptClose();
        }}
        statusBarTranslucent
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView
              style={styles.container}
              keyboardShouldPersistTaps="handled"
            >
              {/* Header */}
              <View className="bg-panel p-4 flex-row justify-between items-center border-b border-border">
                <Text className="text-2xl font-bold text-white">Payment</Text>
                <TouchableOpacity
                  onPress={handleAttemptClose}
                  disabled={isTransactionProcessing}
                  className="px-4 py-2 rounded-lg bg-gray-800 items-center justify-center"
                  style={{
                    opacity: isTransactionProcessing ? 0.3 : 1,
                  }}
                >
                  <Text className="text-sm font-semibold text-gray-300">
                    CLOSE
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Progress Header */}
              <PaymentProgressHeader />

              {/* Content Wrapper */}
              <View style={styles.content}>{renderContent()}</View>
            </ScrollView>
          </View>
        </View>
        {/* Inline confirmation overlay — cannot use Dialog/Portal here since it portals behind the native Modal */}
        {showConfirmation && (
          <View style={StyleSheet.absoluteFill} className="bg-black/80 justify-center items-center p-4">
            <View className="bg-panel border border-gray-700 rounded-2xl p-6 w-[480px] items-center">
              <View className="w-16 h-16 bg-red-900/30 rounded-full items-center justify-center border-4 border-red-500/30 mb-4">
                <AlertTriangle color="#ef4444" size={36} />
              </View>
              <Text className="text-2xl font-bold text-white text-center">Discard Changes?</Text>
              <Text className="text-center text-gray-400 mt-2 text-lg">
                You have unsaved changes. Are you sure you want to close without saving?
              </Text>
              <View className="pt-6 flex-row gap-4 w-full">
                <TouchableOpacity
                  onPress={handleCancelClose}
                  className="flex-1 py-3 border border-gray-600 rounded-lg bg-screen"
                >
                  <Text className="font-bold text-lg text-gray-300 text-center">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmClose}
                  className="flex-1 py-3 rounded-lg bg-red-600"
                >
                  <Text className="font-bold text-white text-lg text-center">Yes, Discard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    height: "90%",
    backgroundColor: colors.screen,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  container: {
    flex: 1,
    backgroundColor: colors.panel,
  },
  content: {
    flex: 1,
  },
});

export default PaymentBottomSheet;
