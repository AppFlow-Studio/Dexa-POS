import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { X } from "lucide-react-native";
import React, { useRef } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import BottomActionBar from "./BottomActionBar";
import CourseAccordion from "./CourseAccordion";
import SeatAccordion from "./SeatAccordion";
import SeatCourseAccordion from "./SeatCourseAccordion";
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
  onOpenServerSheet,
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
  // Seating props
  itemSeatMap,
  activeSeat,
  seatCount,
  onSelectSeat,
  enablePerSeatOrdering = false,
  enableCoursing = true,
  // Course action props
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
}: {
  showOrderDetails?: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
  onPressStartNewCourse: () => void;
  onDoubleTapCourse: (courseId: number) => void;
  activeOrder?: OrderProfile;
  onOpenServerSheet?: () => void;
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
  isFullyPaid?: boolean;
  // Seating props
  itemSeatMap?: Record<string, number | null>;
  activeSeat?: number | null;
  seatCount?: number;
  onSelectSeat?: (seat: number | null) => void;
  enablePerSeatOrdering?: boolean;
  enableCoursing?: boolean;
  // Course action props
  onRushCourse?: (courseId: number) => void;
  onPrioritizeCourse?: (courseId: number) => void;
  onResendCourse?: (courseId: number) => void;
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

  // Determine which accordion to render
  const renderAccordion = () => {
    if (enablePerSeatOrdering && enableCoursing) {
      // Both enabled: seat -> course nesting
      return (
        <SeatCourseAccordion
          activeOrder={activeOrder}
          itemSeatMap={itemSeatMap}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
          currentCourse={currentCourse}
          activeSeat={activeSeat}
          seatCount={seatCount ?? 2}
          onSelectSeat={onSelectSeat}
          onSelectCourse={onSelectCourse}
          onPressStartNewCourse={onPressStartNewCourse}
          onDoubleTapCourse={onDoubleTapCourse}
          onRushCourse={onRushCourse}
          onPrioritizeCourse={onPrioritizeCourse}
          onResendCourse={onResendCourse}
          enableCoursing={enableCoursing}
        />
      );
    }

    if (enablePerSeatOrdering) {
      // Seat only
      return (
        <SeatAccordion
          activeOrder={activeOrder}
          itemSeatMap={itemSeatMap}
          activeSeat={activeSeat}
          seatCount={seatCount ?? 2}
          onSelectSeat={onSelectSeat}
        />
      );
    }

    // Course only or neither (existing behavior)
    return (
      <CourseAccordion
        activeOrder={activeOrder}
        itemCourseMap={itemCourseMap}
        sentCourses={sentCourses}
        currentCourse={currentCourse}
        onSelectCourse={onSelectCourse}
        onPressStartNewCourse={onPressStartNewCourse}
        onDoubleTapCourse={onDoubleTapCourse}
        onOpenServerSheet={onOpenServerSheet}
        onRushCourse={onRushCourse}
        onPrioritizeCourse={onPrioritizeCourse}
        onResendCourse={onResendCourse}
        enableCoursing={enableCoursing}
      />
    );
  };

  return (
    <>
      <View className="max-w-lg  flex-1 flex-col">
        {renderAccordion()}

        {/* --- INLINED ACTIVE DISCOUNT INDICATOR --- */}
        {appliedDiscount && (
          <View className="px-4 pb-2">
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
