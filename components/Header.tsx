import { useEmployeeSettingsStore } from "@/stores/useEmployeeSettingsStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { usePathname, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  Coffee,
  LogOut,
  User,
} from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import SessionDock from "./SessionDock";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { layouts } = useFloorPlanStore();

  const {
    startBreak,
    getSession,
    sessions,
    // MODIFIED: Renamed for clarity to avoid conflict with employeeStore's clockOut
    clockOut: timeclockClockOut,
  } = useTimeclockStore();

  const {
    employees,
    activeEmployeeId: employeeActiveId,
    signOut,
  } = useEmployeeStore();
  const { isBreakAndSwitchEnabled } = useEmployeeSettingsStore();

  const [activeModal, setActiveModal] = useState<"switchAccount" | null>(null);

  const activeEmployee = useMemo(() => {
    return employees.find((e) => e.id === employeeActiveId);
  }, [employees, employeeActiveId]);

  const activeSession = useMemo(() => {
    if (!employeeActiveId) return null;
    return getSession(employeeActiveId);
  }, [employeeActiveId, getSession, sessions]);

  const isClockedIn = !!activeSession && activeSession.status === "clockedIn";
  const isOnBreak = !!activeSession && activeSession.status === "onBreak";

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

  const handleStartBreak = () => {
    if (isClockedIn) {
      startBreak();

      if (isBreakAndSwitchEnabled) {
        toast.success("Break started. Ready for next user.", {
          position: ToastPosition.BOTTOM,
        });
        signOut();
        router.replace("/pin-login");
      } else {
        toast.success("Break started.", { position: ToastPosition.BOTTOM });
      }
    }
  };

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
    <>
      <View className="flex-row justify-between items-center">
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

        <View className="absolute left-1/2 -translate-x-1/2">
          <SessionDock />
        </View>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <TouchableOpacity className="flex-row items-center  cursor-pointer">
              <Image
                source={
                  activeEmployee?.profilePictureUrl
                    ? { uri: activeEmployee.profilePictureUrl }
                    : require("@/assets/images/tom_hardy.jpg")
                }
                className="w-10 h-10 rounded-full"
              />
              <View className="ml-2">
                <Text className="text-xl font-semibold text-white">
                  {activeEmployee?.fullName || "Guest"}
                </Text>
                <Text className="text-lg text-white">
                  {activeEmployee ? "Signed In" : "Not Signed In"}
                </Text>
              </View>
              <ChevronDown color="white" size={20} className="ml-2" />
            </TouchableOpacity>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 bg-[#303030] border-gray-700">
            <DropdownMenuItem
              onPress={() => router.push("/settings/basic/my-profile")}
            >
              <User className="mr-2 h-5 w-5 text-white" color="white" />
              <Text className="text-lg text-white">My Profile</Text>
            </DropdownMenuItem>
            <DropdownMenuItem
              onPress={handleStartBreak}
              disabled={!isClockedIn || isOnBreak}
            >
              <Coffee className="mr-2 h-5 w-5 text-white " color="white" />
              <Text className="text-lg text-white">
                {" "}
                {isOnBreak ? "On Break" : "Take Break"}
              </Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => setActiveModal("switchAccount")}>
              <LogOut className="mr-2 h-5 w-5 text-white" color="white" />
              <Text className="text-lg text-white">Switch Account</Text>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-600" />
            <DropdownMenuItem
              onPress={() => {
                if (employeeActiveId) {
                  timeclockClockOut(employeeActiveId);
                }
                // No need to call signOut() separately, clockOut handles it.
                router.replace("/pin-login");
              }}
            >
              <LogOut className="mr-2 h-5 w-5 text-red-500" color="red" />
              <Text className="text-lg text-red-400">Logout</Text>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
      <SwitchAccountModal
        isOpen={activeModal === "switchAccount"}
        onClose={() => setActiveModal(null)}
      />
    </>
  );
};

export default Header;
