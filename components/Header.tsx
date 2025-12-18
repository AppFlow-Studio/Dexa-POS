import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import {
  Href,
  useGlobalSearchParams,
  usePathname,
  useRouter,
} from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import SessionDock from "./SessionDock";

const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { tables } = useFloorPlanStore();
  const globalParams = useGlobalSearchParams();

  const showBackButton =
    pathname === "/open-shifts" ||
    pathname === "/pto" ||
    pathname === "/requests" ||
    pathname == "/menu" ||
    pathname === "/scheduling" ||
    (pathname.startsWith("/scheduling/") && pathname.split("/").length === 3) ||
    (pathname.startsWith("/scheduling/templates/") &&
      pathname.split("/").length === 4) ||
    pathname === "/tables" ||
    pathname === "/tables/edit-layout" ||
    pathname === "/inventory" ||
    pathname === "/analytics" ||
    pathname === "/previous-orders" ||
    pathname === "/order-processing" ||
    pathname === "/online-orders" ||
    pathname === "/customers-list" ||
    pathname.startsWith("/settings") ||
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
      pathname.split("/").length === 4);

  const title = useMemo(() => {
    if (pathname === "/" || pathname === "/home") return "Menu";
    if (pathname === "/scheduling/reports") return "Reports";
    if (pathname === "/scheduling/templates") return "Schdule Templates";
    if (pathname === "/scheduling/templates/create")
      return "Create New Template";
    if (pathname.startsWith("/scheduling/templates/")) return "Edit Template";
    if (pathname.startsWith("/scheduling/") && pathname.split("/").length === 3)
      return "Scheduling Dashboard";
    if (pathname === "/pto") return "PTO";
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
      const table = tables.find((t) => t.id === tableId);
      if (table) {
        return `Tables / ${table.name}`;
      }
      return "Table Details";
    } else if (
      pathname.startsWith("/tables/clean-table/") &&
      pathname.split("/").length === 4
    ) {
      const tableId = pathname.split("/")[3];
      const table = tables.find((t) => t.id === tableId);
      if (table) {
        return `Clean / ${table.name}`;
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
  }, [pathname, tables]);

  const handleBackPress = () => {
    // In handleBackPress:
    if (globalParams.returnTo && typeof globalParams.returnTo === "string") {
      router.push(globalParams.returnTo as Href);
      return;
    }

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
        // router.push("/settings");
      } else {
        router.push("/home");
      }
      return;
    }

    router.back();
  };

  return (
    <View className="flex-row justify-between items-center h-14">
      <View className="flex-row items-center flex-shrink-0">
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

      <View className="flex-shrink-0">
        <SessionDock />
      </View>
    </View>
  );
};

export default Header;
