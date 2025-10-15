import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { usePathname, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SessionDock from "./SessionDock";

const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { layouts } = useFloorPlanStore();

  const showBackButton =
    pathname == "/menu" ||
    pathname === "/tables" ||
    pathname === "/tables/edit-layout" ||
    pathname === "/inventory" ||
    pathname === "/analytics" ||
    pathname === "/previous-orders" ||
    pathname === "/order-processing" ||
    pathname === "/online-orders" ||
    pathname === "/customers-list" ||
    pathname === "/settings" ||
    pathname === "/settings/floor-plan" ||
    pathname.startsWith("/analytics") ||
    (pathname.startsWith("/analytics-dashboard") &&
      pathname.split("/").length > 2) ||
    (pathname.startsWith("/menu/") && pathname.split("/").length > 2) ||
    (pathname.startsWith("/inventory/") && pathname.split("/").length > 2) ||
    (pathname.startsWith("/online-orders/") &&
      pathname.split("/").length > 2) ||
    (pathname.startsWith("/previous-orders/") &&
      pathname.split("/").length > 2) ||
    (pathname.startsWith("/tables/") && pathname.split("/").length === 3) ||
    (pathname.startsWith("/tables/clean-table/") &&
      pathname.split("/").length === 4) ||
    (pathname.startsWith("/settings") && pathname.split("/").length === 4) ||
    pathname === "/settings/store-operation/end-of-day/checks" ||
    pathname === "/settings/store-operation/end-of-day/drawers" ||
    pathname === "/settings/store-operation/end-of-day/employees" ||
    pathname === "/settings/store-operation/end-of-day/add-cash-to-register" ||
    pathname === "/settings/store-operation/end-of-day/sales-summary";

  const title = useMemo(() => {
    if (pathname === "/" || pathname === "/home") return "Menu";
    if (pathname === "/order-processing") return "Back to Menu";
    if (pathname.startsWith("/previous-orders")) return "Back to Menu";
    if (pathname.startsWith("/inventory/vendors")) return "Vendors";
    if (pathname.startsWith("/inventory/purchase-orders"))
      return "Purchase Orders";
    if (pathname.startsWith("/inventory")) return "Inventory";

    if (
      pathname.startsWith("/online-orders/") &&
      pathname.split("/").length > 2
    ) {
      return "Online Order Details";
    } else if (
      pathname.startsWith("/previous-orders/") &&
      pathname.split("/").length > 2
    ) {
      return "Previous Order Details";
    } else if (pathname.startsWith("/tables/floor-plan")) {
      return "Floor Plan";
    } else if (
      pathname.startsWith("/tables/edit-layout") &&
      pathname.split("/").length === 3
    ) {
      return "Edit Layout";
    } else if (
      pathname.startsWith("/tables/") &&
      pathname.split("/").length === 3
    ) {
      const tableId = pathname.split("/")[2];
      for (const layout of layouts) {
        const table = layout.tables.find((t) => t.id === tableId);
        if (table) {
          return `Tables / ${table.name}`;
        }
      }
      return "Table Details";
    } else if (
      pathname.startsWith("/tables/clean-table/") &&
      pathname.split("/").length === 4
    ) {
      const tableId = pathname.split("/")[3];
      for (const layout of layouts) {
        const table = layout.tables.find((t) => t.id === tableId);
        if (table) {
          return `Clean / ${table.name}`;
        }
      }
      return "Clean Table";
    }

    const pathParts = pathname.split("/").filter(Boolean);
    const lastPart = pathParts[pathParts.length - 1];

    if (!lastPart) return "Order Line";
    const title = lastPart
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());

    return title;
  }, [pathname, layouts]);


  const handleBackPress = () => {
    const pathParts = pathname.split("/").filter(Boolean);

    if (
      pathname.startsWith("/inventory") &&
      !pathname.includes("/purchase-orders/")
    ) {
      router.push("/home");
      return;
    }

    if (pathname.startsWith("/settings")) {
      if (pathParts.length > 2) {
        router.push("/settings");
      } else {
        router.push("/home");
      }
      return;
    }

    router.back();
  };

  return (
    <View className="flex-row justify-between items-center ">
      <View className="flex-row items-center">
        {showBackButton && (
          <TouchableOpacity
            onPress={handleBackPress}
            className="p-2 mr-3 bg-gray-100 rounded-lg"
          >
            <ArrowLeft color="#1f2937" size={20} />
          </TouchableOpacity>
        )}
        <Text className="text-2xl font-bold text-white">{title}</Text>
      </View>

      <View className="">
        <SessionDock />
      </View>

      {/* <View className="w-32" /> */}
    </View>
  );
};

export default Header;
