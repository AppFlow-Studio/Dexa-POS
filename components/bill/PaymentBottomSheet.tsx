import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { usePaymentStore } from "@/stores/usePaymentStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
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
import { Text, TouchableOpacity, View } from "react-native";
import CardPaymentView from "./ paymentView/CardPaymentView";
import CashPaymentView from "./ paymentView/CashPaymentView";
import ItemsReviewView from "./ paymentView/ItemsReviewView";
import PaymentSuccessView from "./ paymentView/PaymentSuccessView";
import CardPaymentOptions from "./paymentView/CardPaymentOptions";
import CustomAmountView from "./paymentView/CustomAmountView";
import ManualCardEntryView from "./paymentView/ManualCardEntryView";
import PaymentMethodSelectionView from "./paymentView/PaymentMethodSelectionView";
import PaymentProgressHeader from "./paymentView/PaymentProgressHeader";
import SplitByItemView from "./paymentView/SplitByItemView";
import SplitEvenlyView from "./paymentView/SplitEvenlyView";
import SplitOptionsView from "./paymentView/SplitOptionsView";

interface PaymentBottomSheetProps {}

const PaymentBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PaymentBottomSheetProps
> = (props, ref) => {
  const { view, close, isDirty, setIsDirty } = usePaymentStore();
  const [showConfirmation, setShowConfirmation] = useState(false);

  // 1. Create an INTERNAL ref that we fully control
  const internalRef = useRef<BottomSheetMethods>(null);

  // 2. Link the Parent's 'ref' to our 'internalRef'
  useImperativeHandle(ref, () => {
    return {
      snapToIndex: (index: number) => internalRef.current?.snapToIndex(index),
      expand: () => internalRef.current?.expand(),
      collapse: () => internalRef.current?.collapse(),
      close: () => internalRef.current?.close(),
      forceClose: () => internalRef.current?.forceClose(),
      // Add any other methods from BottomSheetMethods you need exposed
    } as BottomSheetMethods;
  });

  const snapPoints = useMemo(() => ["25%", "50%"], []);

  const handleSheetChanges = useCallback(
    (index: number) => {
      if (index === -1 && isDirty) {
        setShowConfirmation(true);
        // 3. Use internalRef for internal logic
        internalRef.current?.snapToIndex(0);
      } else if (index === -1 && !isDirty) {
        close();
      }
    },
    [isDirty, close]
  );

  const handleConfirmClose = () => {
    setIsDirty(false);
    setShowConfirmation(false);
    close();
    // Use internal ref to actually close UI if needed, though state update might trigger it depending on logic
    internalRef.current?.close();
  };

  const handleCancelClose = () => {
    setShowConfirmation(false);
    internalRef.current?.snapToIndex(0);
  };

  const handleAttemptClose = () => {
    if (isDirty) {
      setShowConfirmation(true);
    } else {
      internalRef.current?.close(); // Use internal ref to close
    }
  };

  const renderContent = () => {
    switch (view) {
      case "review":
        return <ItemsReviewView />;
      case "payment-method-selection":
        return <PaymentMethodSelectionView />;
      case "cardOptions":
        return <CardPaymentOptions />;
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
        ref={internalRef} // 4. Attach the INTERNAL ref here
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        onChange={handleSheetChanges}
        backgroundStyle={{ backgroundColor: "#212121" }}
        handleIndicatorStyle={{ backgroundColor: "#707070" }}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView className="bg-[#212121] flex-1">
          {/* Header */}
          <View className="bg-[#212121] p-4 flex-row justify-between items-center">
            <Text className="text-2xl font-bold text-white">Payment</Text>
            <TouchableOpacity onPress={handleAttemptClose}>
              <X size={24} color="#FFF" />
            </TouchableOpacity>
          </View>

          {/* Progress Header */}
          <View className="h-10 bg-gray-700 items-center justify-center">
            <PaymentProgressHeader />
          </View>

          {/* Content */}
          <View className="flex-1 p-4">{renderContent()}</View>
        </BottomSheetView>
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

const PaymentBottomSheet = React.forwardRef(PaymentBottomSheetComponent);

export default PaymentBottomSheet;
