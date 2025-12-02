import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { View } from "react-native";
import CourseAccordion from "./CourseAccordion"; // Added import
import OrderDetails from "./OrderDetails";

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
