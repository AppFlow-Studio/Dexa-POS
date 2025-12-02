import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import React from "react";
import { View } from "react-native";
import BottomActionBar from "./BottomActionBar";
import CourseAccordion from "./CourseAccordion"; // Added import
import OrderDetails from "./OrderDetails";
import PricingBreakdownSheet from "./PricingBreakdownSheet";

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap, // Will be passed to CourseAccordion
  sentCourses, // Will be passed to CourseAccordion
  currentCourse, // Will be passed to CourseAccordion
  onSelectCourse, // Will be passed to CourseAccordion
  onPressStartNewCourse, // NEW: Will be passed to CourseAccordion
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
}: {
  showOrderDetails?: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
  onPressStartNewCourse: () => void; // NEW PROP
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
}) => {
  const { activeOrderId, orders } = useOrderStore();
  // Use passed activeOrder if available, otherwise find from store
  const activeOrder =
    passedActiveOrder || orders.find((o) => o.id === activeOrderId);

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
          onPressStartNewCourse={onPressStartNewCourse} // NEW PROP PASSED
        />

        <BottomActionBar
          activeOrder={activeOrder}
          onPressMore={onPressMore}
          onPressTotal={onPressTotal}
          onPressReopenCheck={onPressReopenCheck}
          onPressCloseCheck={onPressCloseCheck}
          onPressClearTable={onPressClearTable}
          totalDisplayAmount={totalDisplayAmount}
        />

        <PricingBreakdownSheet
          ref={pricingSheetRef}
          onClose={onClosePricingSheet}
          onPressProceedToPayment={onPressProceedToPayment}
        />
      </View>
    </>
  );
};

export default TableBillSection;
