import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { X } from "lucide-react-native"; // Added X import
import React, { useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native"; // Added Text, TouchableOpacity
import BottomActionBar from "./BottomActionBar";
import CourseAccordion from "./CourseAccordion";
import DiscountBottomSheet from "./DiscountBottomSheet";
import OrderDetails from "./OrderDetails";
import PricingBreakdownSheet from "./PricingBreakdownSheet";

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  activeOrder: passedActiveOrder,
  onPressMore,
  onPressTotal,
  onPressReopenCheck,
  onPressCloseCheck,
  onPressClearTable,
  totalDisplayAmount,
  pricingSheetRef,
  onClosePricingSheet,
  onPressProceedToPayment,
  setCurrentCourse,
  isFullyPaid,
}: {
  showOrderDetails?: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
  onPressStartNewCourse: () => void;
  onDoubleTapCourse: (courseId: number) => void;
  activeOrder?: OrderProfile;
  onPressMore: () => void;
  onPressTotal: () => void;
  onPressReopenCheck: () => void;
  onPressCloseCheck: () => void;
  onPressClearTable: () => void;
  totalDisplayAmount: number;
  pricingSheetRef: React.RefObject<BottomSheetMethods>;
  onClosePricingSheet: () => void;
  onPressProceedToPayment: () => void;
  setCurrentCourse: (course: number) => void;
  isFullyPaid?: boolean; // LOCAL-FIRST: Use local calculation from parent
}) => {
  const storeActiveOrder = useOrderStore((state) =>
    state.activeOrderId ? state.ordersById[state.activeOrderId] : undefined
  );
  const removeCheckDiscount = useOrderStore(
    (state) => state.removeCheckDiscount
  );
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  const activeOrder = passedActiveOrder ?? storeActiveOrder;

  // Derived check discount
  const appliedDiscount = activeOrder?.checkDiscount;

  // Handler to remove discount
  const handleRemoveDiscount = () => {
    if (activeOrder?.id) {
      removeCheckDiscount(activeOrder.id);
    }
  };

  // console.log('TableBillSection', totalDisplayAmount);
  // console.log("activeOrder [TableBillSection]", activeOrder);
  return (
    <>
      <View className="max-w-lg  flex-1 flex-col">
        {/* {showOrderDetails && <OrderDetails />} */}

        {/* CourseAccordion will be rendered here later */}
        <CourseAccordion // Rendered CourseAccordion
          activeOrder={activeOrder}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
          currentCourse={currentCourse}
          onSelectCourse={onSelectCourse}
          onPressStartNewCourse={onPressStartNewCourse}
          onDoubleTapCourse={onDoubleTapCourse}
        />

        {/* --- INLINED ACTIVE DISCOUNT INDICATOR --- */}
        {appliedDiscount && (
          <View className="px-4 pb-2">
            {/* Using bg-[#303030] to blend with footer area */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              paddingHorizontal: 10, paddingVertical: 6, height: 36,
              backgroundColor: colors.info + '15', borderWidth: 1, borderColor: colors.info + '40',
              borderRadius: 8, gap: 8,
            }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.info }}>
                {appliedDiscount.label}
              </Text>
              <TouchableOpacity onPress={handleRemoveDiscount} style={{ padding: 4 }}>
                <X color={colors.info} size={14} />
              </TouchableOpacity>
            </View>
          </View>
        )}
        {/* --------------------------------------- */}

        <BottomActionBar
          activeOrder={activeOrder}
          onPressMore={onPressMore}
          onPressTotal={onPressTotal}
          onPressReopenCheck={onPressReopenCheck}
          onPressCloseCheck={onPressCloseCheck}
          onPressClearTable={onPressClearTable}
          totalDisplayAmount={totalDisplayAmount}
          onPressDiscount={() => discountSheetRef.current?.expand()}
          isFullyPaid={isFullyPaid}
          paymentCount={activeOrder?.payments?.length ?? 0}
        />

        <PricingBreakdownSheet
          ref={pricingSheetRef}
          onClose={onClosePricingSheet}
          onPressProceedToPayment={onPressProceedToPayment}
          totalDisplayAmount={totalDisplayAmount}
          hasPayments={(activeOrder?.payments?.length ?? 0) > 0}
        />
        <DiscountBottomSheet
          ref={discountSheetRef}
          onClose={() => discountSheetRef.current?.close()}
        />
      </View>
    </>
  );
};

export default TableBillSection;
