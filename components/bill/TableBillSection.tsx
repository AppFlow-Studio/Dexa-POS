import { CartItem, OrderProfile } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import DiscountSection from "./DiscountSection";
import Totals from "./Totals";

const CourseSummary: React.FC<{
  cart: CartItem[];
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (course: number) => void; // This component still only needs to know the course number
}> = ({ cart, itemCourseMap, sentCourses, currentCourse, onSelectCourse }) => {
  const summary = React.useMemo(() => {
    const s: Record<number, number> = {};
    cart.forEach((i) => {
      const course = itemCourseMap?.[i.id] ?? 1;
      s[course] = (s[course] || 0) + i.quantity;
    });
    if (currentCourse !== undefined && s[currentCourse] === undefined) {
      s[currentCourse] = 0;
    }
    return s;
  }, [cart, itemCourseMap, currentCourse]);

  if (Object.keys(summary).length === 0) return null;

  return (
    <ScrollView horizontal={true} className="max-h-16">
      <View className="px-3 py-2 border-b border-gray-700 flex-row items-center justify-between">
        <View className="flex-row flex-wrap gap-2">
          {Object.entries(summary)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([course, count]) => {
              const sent = !!sentCourses?.[Number(course)];
              const isActive = Number(course) === (currentCourse ?? 0);
              const itemsInCourse = cart.filter(
                (item) => (itemCourseMap?.[item.id] ?? 1) === Number(course)
              );
              const allItemsSent =
                itemsInCourse.length > 0 &&
                itemsInCourse.every(
                  (item) =>
                    item.kitchen_status === "sent" ||
                    item.kitchen_status === "ready" ||
                    item.kitchen_status === "served"
                );
              const anyItemsReady = itemsInCourse.some(
                (item) =>
                  item.kitchen_status === "ready" ||
                  item.kitchen_status === "served"
              );
              return (
                <View
                  key={course}
                  className={`px-2.5 py-1.5 rounded-lg flex-row items-center gap-2 ${
                    sent || allItemsSent
                      ? "bg-green-900/30 border border-green-500"
                      : anyItemsReady
                      ? "bg-yellow-900/30 border border-yellow-500"
                      : isActive
                      ? "bg-blue-900/30 border border-blue-500"
                      : "bg-[#212121] border border-gray-700"
                  }`}
                >
                  <View
                    className={`w-2.5 h-2.5 rounded-lg ${
                      sent || allItemsSent
                        ? "bg-green-500"
                        : anyItemsReady
                        ? "bg-yellow-500"
                        : "bg-gray-500"
                    }`}
                  />
                  <Text className="text-base font-semibold text-white">
                    Course {course}
                  </Text>
                  <View className="w-1" />
                  <Text className="text-base font-semibold text-gray-300">
                    x{count}
                  </Text>
                  {sent || allItemsSent ? (
                    <Text className="text-base font-bold text-green-400 ml-1.5">
                      Sent
                    </Text>
                  ) : anyItemsReady ? (
                    <Text className="text-base font-bold text-yellow-400 ml-1.5">
                      In Progress
                    </Text>
                  ) : (
                    <TouchableOpacity
                      onPress={() =>
                        onSelectCourse && onSelectCourse(Number(course))
                      }
                    >
                      <Text className="text-base font-bold text-blue-400 ml-1.5">
                        Select
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
        </View>
      </View>
    </ScrollView>
  );
};

const OrderSubSection: React.FC<{
  order: OrderProfile;
  onSelectCourse?: (orderId: string, course: number) => void;
  isActiveOrder: boolean;
}> = ({ order, onSelectCourse, isActiveOrder }) => {
  const { sendNewItemsToKitchenForOrder } = useOrderStore();
  const { layouts } = useFloorPlanStore();
  const table = layouts
    .flatMap((l) => l.tables)
    .find((t) => t.id === order.service_location_id);
  const coursingState = useCoursingStore((state) =>
    state.getForOrder(order.id)
  );
  const newItemsCount = order.items.filter(
    (item) => !item.kitchen_status || item.kitchen_status === "new"
  ).length;

  return (
    <View
      className={`border-b-4 pb-3 mb-3 ${
        isActiveOrder ? "border-blue-500" : "border-black"
      }`}
    >
      <Text className="text-xl font-bold text-white mb-2 px-6">
        Table {table?.name}
      </Text>
      <CourseSummary
        cart={order.items}
        itemCourseMap={coursingState?.itemCourseMap}
        sentCourses={coursingState?.sentCourses}
        // Only show the "active" blue highlight if this is the active order
        currentCourse={isActiveOrder ? coursingState?.currentCourse : undefined}
        onSelectCourse={(course) =>
          onSelectCourse && onSelectCourse(order.id, course)
        }
      />
      <BillSummary
        cart={order.items}
        itemCourseMap={coursingState?.itemCourseMap}
        sentCourses={coursingState?.sentCourses}
      />
    </View>
  );
};

const TAX_RATE = 0.05;

const TableBillSection = ({
  orders,
  isMergedView,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
}: {
  orders: OrderProfile[];
  isMergedView: boolean;
  itemCourseMap?: Record<string, number>;
  sentCourses?: Record<number, boolean>;
  currentCourse?: number;
  onSelectCourse?: (orderId: string, course: number) => void;
}) => {
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const { activeOrderId } = useOrderStore();
  const combinedCart = React.useMemo(
    () => orders.flatMap((o) => o.items),
    [orders]
  );

  const { subtotal, discount, tax, total } = React.useMemo(() => {
    let sub = 0;
    let totalDiscount = 0;

    orders.forEach((order) => {
      const orderSubtotal = order.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0
      );
      sub += orderSubtotal;

      const itemDiscounts = order.items.reduce((acc, item) => {
        if (item.appliedDiscount) {
          return (
            acc +
            item.originalPrice * item.appliedDiscount.value * item.quantity
          );
        }
        return acc;
      }, 0);

      let checkDiscount = 0;
      if (order.checkDiscount) {
        checkDiscount =
          (orderSubtotal - itemDiscounts) * order.checkDiscount.value;
      }

      totalDiscount += itemDiscounts + checkDiscount;
    });

    const finalSubtotal = sub - totalDiscount;
    const taxAmount = finalSubtotal * TAX_RATE;
    const totalAmount = finalSubtotal + taxAmount;

    return {
      subtotal: sub,
      discount: totalDiscount,
      tax: taxAmount,
      total: totalAmount,
    };
  }, [orders]);

  if (orders.length === 0)
    return <View className="max-w-lg bg-[#303030] flex-1" />;

  return (
    <>
      <View className="max-w-lg bg-[#303030] flex-1">
        <ScrollView className="flex-1 bg-[#212121]">
          {isMergedView ? (
            orders.map((order) => {
              // The key now changes when the global active order changes,
              // forcing the correct sub-section to re-render with its active state.
              const coursingState = useCoursingStore
                .getState()
                .getForOrder(order.id);
              const isActiveOrder = activeOrderId === order.id;
              return (
                <OrderSubSection
                  key={
                    order.id +
                    (isActiveOrder ? `_${coursingState?.currentCourse}` : "")
                  }
                  order={order}
                  onSelectCourse={onSelectCourse}
                  isActiveOrder={activeOrderId === order.id}
                />
              );
            })
          ) : (
            <>
              <CourseSummary
                cart={combinedCart}
                itemCourseMap={itemCourseMap}
                sentCourses={sentCourses}
                currentCourse={currentCourse}
                onSelectCourse={(course) =>
                  onSelectCourse && onSelectCourse(orders[0].id, course)
                }
              />
              <BillSummary
                cart={combinedCart}
                itemCourseMap={itemCourseMap}
                sentCourses={sentCourses}
                currentCourse={currentCourse}
              />
            </>
          )}
        </ScrollView>

        <Totals
          subtotal={subtotal}
          tax={tax}
          discount={discount}
          total={total}
        />
        <DiscountSection
          onOpenDiscounts={() => setDiscountOverlayVisible(true)}
        />
        <DiscountOverlay
          isVisible={isDiscountOverlayVisible}
          onClose={() => setDiscountOverlayVisible(false)}
        />
      </View>
    </>
  );
};

export default TableBillSection;
