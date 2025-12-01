import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { View } from "react-native";
import OrderDetails from "./OrderDetails";
import CourseAccordion from "./CourseAccordion"; // Added import

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap, // Will be passed to CourseAccordion
  sentCourses, // Will be passed to CourseAccordion
  currentCourse, // Will be passed to CourseAccordion
  onSelectCourse, // Will be passed to CourseAccordion
}: {
  showOrderDetails?: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number | null) => void;
}) => {
  const { activeOrderId, orders } = useOrderStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  const handleChipLayout = (event: LayoutChangeEvent, course: number) => {
    const { x, width } = event.nativeEvent.layout;
    setChipLayouts((prev) => ({ ...prev, [course]: { x, width } }));
  };

  useEffect(() => {
    if (currentCourse && chipLayouts[currentCourse] && scrollViewWidth > 0 && contentWidth > 0) {
      const chip = chipLayouts[currentCourse];
      const targetX = chip.x - scrollViewWidth / 2 + chip.width / 2;

      // Clamp the scroll position to avoid scrolling past the edges
      const maxScrollX = contentWidth - scrollViewWidth;
      const clampedX = Math.max(0, Math.min(targetX, maxScrollX > 0 ? maxScrollX : 0));

      scrollViewRef.current?.scrollTo({ x: clampedX, animated: true });
    }
  }, [currentCourse, chipLayouts, scrollViewWidth, contentWidth]); // Added contentWidth to dependencies

  return (
    <>
      <View className="max-w-lg  flex-1">
        {showOrderDetails && <OrderDetails />}

        {/* CourseAccordion will be rendered here later */}
        <CourseAccordion // Rendered CourseAccordion
          activeOrder={activeOrder}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
          currentCourse={currentCourse}
          onSelectCourse={onSelectCourse}
        />
      </View>
    </>
  );
};

export default TableBillSection;
