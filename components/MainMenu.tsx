import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { colors } from "@/lib/theme";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useRouter } from "expo-router";
import {
  Award,
  BarChart3,
  ChefHat,
  Cpu,
  History,
  LayoutGrid,
  Lock,
  Package,
  Settings,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react-native";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import PinDisplay from "./auth/PinDisplay";
import PinNumpad from "./auth/PinNumpad";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface MenuCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  isLocked?: boolean;
  onLockPress?: () => void;
  isDisabled?: boolean;
}

const MenuCard: React.FC<MenuCardProps> = ({
  icon,
  title,
  onPress,
  isLocked = false,
  onLockPress,
  isDisabled = false,
}) => {
  const renderedIcon = React.isValidElement<{ color?: string }>(icon)
    ? React.cloneElement(icon, {
        color: isDisabled ? colors.muted : icon.props.color,
      })
    : icon;

  return (
    <View
      pointerEvents={isDisabled ? "none" : "auto"}
      style={{ width: "100%", height: "100%" }}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={isDisabled ? 1 : 0.7}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: isDisabled ? colors.border : colors.teal + "25",
          backgroundColor: isDisabled ? colors.panel : colors.card,
          alignItems: "center",
          justifyContent: "center",
          padding: 12,
          opacity: isDisabled ? 0.45 : 1,
        }}
      >
        {/* Top accent line */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: "20%",
            right: "20%",
            height: 2,
            backgroundColor: isDisabled ? colors.border : colors.teal + "60",
            borderBottomLeftRadius: 2,
            borderBottomRightRadius: 2,
          }}
        />

        {isLocked && !isDisabled && (
          <TouchableOpacity
            onPress={onLockPress}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            style={{ position: "absolute", top: 10, right: 10 }}
          >
            <Lock color={colors.muted} size={11} />
          </TouchableOpacity>
        )}

        {/* Icon */}
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: isDisabled ? colors.card : colors.teal + "15",
            borderWidth: 1,
            borderColor: isDisabled ? colors.border : colors.teal + "40",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
          }}
        >
          {renderedIcon}
        </View>

        <Text
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: isDisabled ? colors.muted : colors.heading,
            textAlign: "center",
          }}
          numberOfLines={1}
        >
          {title}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const MainMenu: React.FC = () => {
  const router = useRouter();
  const employees = useEmployeeStore((s) => s.employees);
  const { rawIsOnline } = useNetworkStatus();
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [targetRoute, setTargetRoute] = useState<string | null>(null);
  const [pinError, setPinError] = useState("");

  const offlineAllowedRoutes = new Set([
    "/order-processing",
    "/tables",
    "/settings",
  ]);

  const handleLockedAccess = (route: string) => {
    setTargetRoute(route);
    setPinDialogOpen(true);
    setCurrentPin("");
    setPinError("");

    // Debug: Log all manager/admin/owner PINs available
    const allowedRoles = [
      "merchant.admin",
      "merchant.manager",
      "merchant.owner",
      "merchant.shift_manager",
      "merchant.inventory_manager",
    ];
    const authorizedEmployees = employees.filter((emp) =>
      allowedRoles.includes(emp.role),
    );
    console.log(
      "[MainMenu] Authorized employees with PINs:",
      authorizedEmployees.map((e) => ({
        name: e.fullName,
        role: e.role,
        pin: e.pin,
        pinLength: e.pin?.length,
      })),
    );
  };

  const handlePinSubmit = () => {
    if (currentPin.length !== 4) return;

    const allowedRoles = [
      "merchant.admin",
      "merchant.manager",
      "merchant.owner",
      "merchant.shift_manager",
      "merchant.inventory_manager",
    ];

    // Debug logging
    console.log("[PIN Submit] Checking PIN:", {
      entered: currentPin,
      enteredLength: currentPin.length,
      totalEmployees: employees.length,
      authorizedEmployees: employees.filter((e) =>
        allowedRoles.includes(e.role),
      ).length,
    });

    // Find any employee with matching PIN and admin/manager/owner role
    const authorizedEmployee = employees.find((emp) => {
      const trimmedPin = emp.pin?.trim() ?? "";
      const isMatch =
        trimmedPin === currentPin && allowedRoles.includes(emp.role);

      if (allowedRoles.includes(emp.role)) {
        console.log(
          `[PIN Check] ${emp.fullName} (${emp.role}): stored="${trimmedPin}" vs entered="${currentPin}" - match=${isMatch}`,
        );
      }

      return isMatch;
    });

    console.log("[PIN Result]", {
      found: !!authorizedEmployee,
      employeeName: authorizedEmployee?.fullName,
    });

    if (!authorizedEmployee) {
      setPinError("Invalid PIN or insufficient permissions");
      setCurrentPin("");
      return;
    }

    // All validations passed
    setPinDialogOpen(false);
    if (targetRoute) router.push(targetRoute as any);
    setCurrentPin("");
    setTargetRoute(null);
    setPinError("");
  };

  const menuItems = [
    {
      id: "home",
      icon: <ShoppingCart color={colors.teal} size={20} />,
      title: "Sales",
      subtitle: "Process Orders",
      route: "/order-processing",
    },
    {
      id: "tables",
      icon: <LayoutGrid color={colors.teal} size={20} />,
      title: "Tables",
      subtitle: "Manage Seating",
      route: "/tables",
    },
    {
      id: "previous-orders",
      icon: <History color={colors.teal} size={20} />,
      title: "Previous Orders",
      subtitle: "Order History",
      route: "/previous-orders",
    },
    // {
    //   id: 'online-orders',
    //   icon: <ShoppingBag color={colors.teal} size={20} />,
    //   title: 'Online Orders',
    //   subtitle: 'Web & App Orders',
    //   route: '/online-orders'
    // },
    {
      id: "kds",
      icon: <ChefHat color={colors.teal} size={20} />,
      title: "Kitchen Display",
      subtitle: "Manage Orders",
      route: "/kds",
    },
    // {
    //   id: 'scheduling',
    //   icon: <CalendarClock color={colors.teal} size={20} />,
    //   title: 'Scheduling',
    //   subtitle: 'Time Management',
    //   route: '/scheduling',
    //   isLocked: true
    // },
    {
      id: "menu-management",
      icon: <UtensilsCrossed color={colors.teal} size={20} />,
      title: "Menu Management",
      subtitle: "Edit Menu Items",
      route: "/menu",
      isLocked: true,
    },
    {
      id: "inventory",
      icon: <Package color={colors.teal} size={20} />,
      title: "Inventory",
      subtitle: "Stock Management",
      route: "/inventory",
      isLocked: true,
    },
    {
      id: "analytics",
      icon: <BarChart3 color={colors.teal} size={20} />,
      title: "Analytics",
      subtitle: "Sales Reports",
      route: "/analytics",
      isLocked: true,
    },
    {
      id: "settings",
      icon: <Settings color={colors.teal} size={20} />,
      title: "Settings",
      subtitle: "System Config",
      route: "/settings",
      isLocked: true,
    },
    {
      id: "loyalty",
      icon: <Award color={colors.teal} size={20} />,
      title: "Loyalty",
      subtitle: "Rewards & Members",
      route: "/loyalty",
    },
    // {
    //   id: 'castlestest',
    //   icon: <Cpu color={colors.teal} size={20} />,
    //   title: 'Castles Test',
    //   subtitle: 'Castles device test',
    //   route: '/castlestest'
    // }
  ];

  if (__DEV__) {
    menuItems.push({
      id: "castlestest",
      icon: <Cpu color={colors.teal} size={20} />,
      title: "Castles Test",
      subtitle: "Castles device test",
      route: "/castlestest",
    });
  }

  const regularItems = menuItems.filter((item) => !item.isLocked);
  const managementItems = menuItems.filter((item) => item.isLocked);

  const renderRow = (items: typeof menuItems) => (
    <View style={{ flexDirection: "row", gap: 20, justifyContent: "center" }}>
      {items.map((item) => (
        <View key={item.id} style={{ width: 150, height: 150 }}>
          {(() => {
            const isDisabled =
              !rawIsOnline && !offlineAllowedRoutes.has(item.route);

            return (
              <MenuCard
                icon={item.icon}
                title={item.title}
                subtitle={item.subtitle}
                onPress={() => {
                  if (isDisabled) return;

                  if (item.isLocked) {
                    handleLockedAccess(item.route);
                  } else {
                    router.push(item.route as any);
                  }
                }}
                isLocked={item.isLocked}
                onLockPress={() => {
                  if (isDisabled) return;
                  handleLockedAccess(item.route);
                }}
                isDisabled={isDisabled}
              />
            );
          })()}
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          alignItems: "center",
          padding: 20,
          gap: 50,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignItems: "center", gap: 14 }}>
          <Text
            style={{
              fontSize: 12,
              color: colors.heading,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              padding: 8,
            }}
          >
            Operations
          </Text>
          {renderRow(regularItems)}
        </View>
        <View style={{ alignItems: "center", gap: 14 }}>
          <Text
            style={{
              fontSize: 12,
              color: colors.heading,
              fontWeight: "700",
              letterSpacing: 1.4,
              textTransform: "uppercase",
              padding: 8,
            }}
          >
            Management
          </Text>
          {renderRow(managementItems)}
        </View>
      </ScrollView>

      {/* Manager PIN Dialog */}
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.card,
            borderRadius: 14,
          }}
          className="w-fit h-fit p-0"
        >
          <View
            style={{
              padding: 24,
              minWidth: 320,
            }}
          >
            <DialogHeader>
              <DialogTitle>
                <Text
                  style={{
                    fontSize: 15,
                    fontWeight: "700",
                    color: colors.heading,
                    textAlign: "center",
                  }}
                >
                  Manager Access Required
                </Text>
              </DialogTitle>
            </DialogHeader>

            <Text
              style={{
                fontSize: 12,
                color: colors.muted,
                textAlign: "center",
                marginTop: 6,
                marginBottom: 16,
              }}
            >
              Enter your manager PIN to continue
            </Text>

            <PinDisplay pinLength={currentPin.length} maxLength={4} />

            <View
              style={{
                minHeight: 18,
                marginTop: 8,
                marginBottom: 2,
                justifyContent: "center",
              }}
            >
              {pinError && (
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.danger,
                    textAlign: "center",
                  }}
                >
                  {pinError}
                </Text>
              )}
            </View>

            <View style={{ marginTop: 8 }}>
              <PinNumpad
                onKeyPress={(input) => {
                  // Clear error when user starts typing
                  if (pinError) setPinError("");

                  if (typeof input === "number") {
                    if (currentPin.length < 4) {
                      const newPin = currentPin + input.toString();
                      setCurrentPin(newPin);
                      if (newPin.length === 4) setTimeout(handlePinSubmit, 100);
                    }
                  } else if (input === "clear") {
                    setCurrentPin("");
                  } else if (input === "backspace") {
                    setCurrentPin(currentPin.slice(0, -1));
                  }
                }}
              />
            </View>

            <TouchableOpacity
              onPress={handlePinSubmit}
              disabled={currentPin.length < 4}
              style={{
                marginTop: 14,
                paddingVertical: 11,
                backgroundColor:
                  currentPin.length === 4 ? colors.teal : colors.teal + "30",
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "700",
                  color:
                    currentPin.length === 4 ? colors.onSolid : colors.muted,
                }}
              >
                Enter
              </Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default MainMenu;
