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
}) => {
  // Added removeCheckDiscount to destructuring
  const { activeOrderId, orders, removeCheckDiscount } = useOrderStore();
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  const activeOrder =
    passedActiveOrder || orders.find((o) => o.id === activeOrderId);
  // Derived check discount
  const appliedDiscount = activeOrder?.checkDiscount;

  // Handler to remove discount
  const handleRemoveDiscount = () => {
    if (activeOrder?.id) {
      removeCheckDiscount(activeOrder.id);
    }
  };

  return (
    <>
      <View className="max-w-lg  flex-1 flex-col">
        {showOrderDetails && <OrderDetails />}

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
            <View
              className="flex-row items-center justify-between p-1.5 pl-3 bg-blue-900/30 border border-blue-500 rounded-xl gap-2"
              style={{ height: 44 }}
            >
              <View className="flex-row items-center">
                <Text className="text-base font-bold text-blue-400">
                  {appliedDiscount.label}
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleRemoveDiscount}
                className="p-1.5 bg-blue-600/30 rounded-full"
              >
                <X color="#60A5FA" size={20} />
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
        />

        <PricingBreakdownSheet
          ref={pricingSheetRef}
          onClose={onClosePricingSheet}
          onPressProceedToPayment={onPressProceedToPayment}
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
