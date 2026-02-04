import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { usePaymentStore } from "@/stores/usePaymentStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { X } from "lucide-react-native";
import React, {
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native"; // Import standard View
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
import SplitPaymentSuccessView from "./SplitPaymentSuccessView";

interface PaymentBottomSheetProps { }

const PaymentBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PaymentBottomSheetProps
> = (props, ref) => {
  const view = usePaymentStore((s) => s.view);
  const close = usePaymentStore((s) => s.close);
  const isDirty = usePaymentStore((s) => s.isDirty);
  const setIsDirty = usePaymentStore((s) => s.setIsDirty);
  const handleSuccessClose = usePaymentStore((s) => s.handleSuccessClose);
  const isTransactionProcessing = usePaymentStore((s) => s.isTransactionProcessing);
  const [showConfirmation, setShowConfirmation] = useState(false);
  
  const internalRef = useRef<BottomSheetMethods>(null);

  useImperativeHandle(
    ref,
    () =>
      ({
        snapToIndex: (index: number) => internalRef.current?.snapToIndex(index),
        expand: () => internalRef.current?.expand(),
        collapse: () => internalRef.current?.collapse(),
        close: () => internalRef.current?.close(),
        forceClose: () => internalRef.current?.forceClose(),
      }) as BottomSheetMethods
  );

  // 90% ensures full height on tablets, 50% for quick actions
  const snapPoints = useMemo(() => ["90%", "95%", '100%'], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      // Block dismissal while a transaction is processing
      if (index === -1 && isTransactionProcessing) {
        internalRef.current?.snapToIndex(0);
        return;
      }
      if (index === -1 && isDirty && !showConfirmation) {
        setShowConfirmation(true);
        internalRef.current?.snapToIndex(0);
      } else if (index === -1 && !isDirty) {
        // If on success view, run Done logic; otherwise just close
        if (view === "success") {
          handleSuccessClose();
        } else {
          close();
        }
      }
    },
    [isDirty, close, showConfirmation, view, handleSuccessClose, isTransactionProcessing]
  );

  const handleConfirmClose = () => {
    setIsDirty(false); // isDirty should be controlled by the store actions, not directly here.
    setShowConfirmation(false);
    close();
  };

  const handleCancelClose = () => {
    setShowConfirmation(false);
    internalRef.current?.snapToIndex(0);
  };

  const handleAttemptClose = () => {
    if (isTransactionProcessing) return; // Block close during active transaction
    if (isDirty) {
      setShowConfirmation(true);
    } else {
      close();
    }
  };

  const renderContent = () => {
    switch (view) {
      case "review":
        return;
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
      case "success":
        return <PaymentSuccessView />;
      default:
        return <Text className="text-white">Unknown View</Text>;
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
        ref={internalRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={!isTransactionProcessing}
        onChange={handleSheetChanges}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#707070" }}
        backdropComponent={renderBackdrop}
        topInset={60}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        
      >
        <BottomSheetScrollView style={styles.container}>
          {/* Header */}
          <View className="bg-[#212121] p-4 flex-row justify-between items-center border-b border-[#333]">
            <Text className="text-2xl font-bold text-white">Payment</Text>
            <TouchableOpacity onPress={handleAttemptClose} disabled={isTransactionProcessing} style={{ opacity: isTransactionProcessing ? 0.3 : 1 }}>
              <X size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Progress Header */}
          <View className="h-10 bg-gray-700 items-center justify-center">
            <PaymentProgressHeader />
          </View>

          {/* Content Wrapper */}
          <View style={styles.content}>{renderContent()}</View>
        </BottomSheetScrollView>
      </BottomSheet>
      <ConfirmationModal
        isOpen={showConfirmation}
        onConfirm={handleConfirmClose}
        onClose={handleCancelClose}
        title="Discard Changes?"
        description="You have unsaved changes. Are you sure you want to close without saving?"
        confirmText="Yes, Discard"
        variant="destructive"
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    height: "100%",

    backgroundColor: "#212121", // Ensure bg color so it's not transparent
  },
  content: {
    flex: 1, // Ensures child views can take up remaining space
  },
});

const PaymentBottomSheet = React.forwardRef(PaymentBottomSheetComponent);

export default PaymentBottomSheet;
