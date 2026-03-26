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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 }]}>
            <View style={{ backgroundColor: colors.panel, borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 }}>
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: colors.danger + "20", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                  <AlertTriangle size={28} color={colors.danger} strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: "800", color: colors.heading, marginBottom: 8, textAlign: "center" }}>
                  Discard Changes?
                </Text>
                <Text style={{ fontSize: 13, color: colors.label, textAlign: "center", lineHeight: 20 }}>
                  You have unsaved payment changes. This action cannot be undone.
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                <TouchableOpacity
                  onPress={handleCancelClose}
                  style={{ flex: 1, backgroundColor: colors.teal + "15", borderRadius: 12, borderWidth: 1.5, borderColor: colors.teal + "50", paddingVertical: 13, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, color: colors.teal, fontWeight: "700" }}>
                    Keep Changes
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleConfirmClose}
                  style={{ flex: 1, backgroundColor: colors.danger + "15", borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + "50", paddingVertical: 13, alignItems: "center" }}
                >
                  <Text style={{ fontSize: 14, color: colors.danger, fontWeight: "700" }}>
                    Discard
                  </Text>
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
