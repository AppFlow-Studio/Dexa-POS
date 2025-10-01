import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { usePathname, useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  Coffee,
  LogOut,
  User,
} from "lucide-react-native";
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import SwitchAccountModal from "./settings/security-and-login/SwitchAccountModal";
import BreakEndedModal from "./timeclock/BreakEndedModal";
import BreakModal from "./timeclock/BreakModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

const generateTitleFromPath = (pathname: string): string => {
  if (pathname === "/" || pathname === "/home") return "Menu";
  if (pathname === "/order-processing") return "Back to Menu";
  if (pathname.startsWith("/previous-orders")) return "Back to Menu";
  if (pathname.startsWith("/inventory/vendors")) return "Vendors";
  if (pathname.startsWith("/inventory/purchase-orders"))
    return "Purchase Orders";
  if (pathname.startsWith("/inventory")) return "Inventory";

  // Handle dynamic online order route
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
    return `Tables/Table${tableId}`;
  } else if (
    pathname.startsWith("/tables/clean/") &&
    pathname.split("/").length === 4
  ) {
    const tableId = pathname.split("/")[3];
    return `Tables/Table ${tableId}`;
  }

  const pathParts = pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];

  if (!lastPart) return "Order Line"; // Default for safety

  const title = lastPart
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

  return title;
};

const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const title = generateTitleFromPath(pathname);

  const { status, startBreak, endBreak, currentShift } = useTimeclockStore();
  const {
    employees,
    activeEmployeeId,
    clockOut: empClockOut,
    signOut,
  } = useEmployeeStore();
  const [activeModal, setActiveModal] = useState<
    "switchAccount" | "break" | "breakEnded" | null
  >(null);
  const [lastBreakSession, setLastBreakSession] = useState<any>(null);

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

  const handleStartBreak = () => {
    if (status === "clockedIn") {
      startBreak();
      // The timeclock store now handles the status, we just open the modal
      setActiveModal("break");
    } else {
      alert("You must be clocked in to start a break.");
    }
  };

  const handleEndBreak = () => {
    const shiftForSession = useTimeclockStore.getState().currentShift;
    setLastBreakSession(shiftForSession);
    endBreak();
    setActiveModal("breakEnded");
  };

  const handleReturnToClockIn = () => {
    setActiveModal(null);
    setLastBreakSession(null);
  };

  const handleBackPress = () => {
    // If we are anywhere inside the inventory section, always go back to the main menu.
    if (
      (pathname.startsWith("/inventory") &&
        !pathname.includes("/purchase-orders/")) ||
      pathname.startsWith("/settings")
    ) {
      router.push("/home");
    } else {
      // Otherwise, use the default back behavior.
      router.back();
    }
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
              <ArrowLeft color="#1f2937" size={20}  />
            </TouchableOpacity>
          )}
          <Text className="text-2xl font-bold text-white">{title}</Text>
        </View>
        <DropdownMenu>
          <DropdownMenuTrigger asChild >
            <TouchableOpacity className="flex-row items-center  cursor-pointer">
              <Image
                source={
                  activeEmployeeId
                    ? employees.find((e) => e.id === activeEmployeeId)
                        ?.profilePictureUrl
                      ? {
                          uri: employees.find((e) => e.id === activeEmployeeId)!
                            .profilePictureUrl!,
                        }
                      : require("@/assets/images/tom_hardy.jpg")
                    : require("@/assets/images/tom_hardy.jpg")
                }
                className="w-10 h-10 rounded-full"
              />
              <View className="ml-2">
                <Text className="text-xl font-semibold text-white">
                  {activeEmployeeId
                    ? employees.find((e) => e.id === activeEmployeeId)
                        ?.fullName || "Employee"
                    : "Guest"}
                </Text>
                <Text className="text-lg text-white">
                  {activeEmployeeId ? "Signed In" : "Not Signed In"}
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
              disabled={status !== "clockedIn" || currentShift?.hasTakenBreak}
            >
              <Coffee className="mr-2 h-5 w-5 text-white " color="white" />
              <Text className="text-lg text-white">
                {currentShift?.hasTakenBreak ? "Break Taken" : "Take Break"}
              </Text>
            </DropdownMenuItem>
            <DropdownMenuItem onPress={() => setActiveModal("switchAccount")}>
              <LogOut className="mr-2 h-5 w-5 text-white"  color="white"/>
              <Text className="text-lg text-white">Switch Account</Text>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-600" />
            <DropdownMenuItem
              onPress={() => {
                if (activeEmployeeId) {
                  try {
                    empClockOut(activeEmployeeId);
                  } catch {}
                  try {
                    useTimeclockStore.getState().clockOut();
                  } catch {}
                  try {
                    signOut();
                  } catch {}
                }
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
      <BreakModal
        isOpen={activeModal === "break"}
        onEndBreak={handleEndBreak}
      />
      <BreakEndedModal
        isOpen={activeModal === "breakEnded"}
        onClockIn={handleReturnToClockIn}
        shift={lastBreakSession}
      />
    </>
  );
};

export default Header;
