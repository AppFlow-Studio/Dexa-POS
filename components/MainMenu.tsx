import { useRouter } from "expo-router";
import {
    BarChart3,
    History,
    Home,
    Lock,
    Package,
    Settings,
    ShoppingBag,
    Table,
    Users,
    UtensilsCrossed,
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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
    isHighlighted?: boolean;
}

const MenuCard: React.FC<MenuCardProps> = ({
    icon,
    title,
    subtitle,
    onPress,
    isLocked = false,
    onLockPress,
    isHighlighted = false,
}) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            className={`w-full h-full rounded-2xl border border-gray-200 p-4 ${isHighlighted ? "bg-blue-50" : "bg-white"
                }`}
            style={{ minHeight: 140 }}
        >
            <View className="justify-center h-full w-full flex">
                <View className="flex-row justify-center items-center w-full h-full relative">
                    <View className=" w-full h-full flex items-center justify-center">
                        <View className="mb-3">{icon}</View>
                        <Text className="text-lg font-bold text-gray-800 mb-1 text-center">{title}</Text>
                        <Text className="text-sm text-gray-500 text-center">{subtitle}</Text>
                    </View>
                    {isLocked && (
                        <TouchableOpacity
                            onPress={onLockPress}
                            className="p-2 bg-gray-100 rounded-lg absolute top-0 right-0"
                        >
                            <Lock color="#6b7280" size={16} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
};

const MainMenu: React.FC = () => {
    const router = useRouter();
    const [pinDialogOpen, setPinDialogOpen] = useState(false);
    const [currentPin, setCurrentPin] = useState("");
    const [targetRoute, setTargetRoute] = useState<string | null>(null);

    const handleLockedAccess = (route: string) => {
        setTargetRoute(route);
        setPinDialogOpen(true);
        setCurrentPin("");
    };

    const handlePinSubmit = () => {
        // TODO: Implement actual PIN validation logic
        // For now, we'll accept any 4-digit PIN
        if (currentPin.length === 4) {
            setPinDialogOpen(false);
            if (targetRoute) {
                router.push(targetRoute as any);
            }
            setCurrentPin("");
            setTargetRoute(null);
        }
    };

    const menuItems = [
        {
            id: "home",
            icon: <Home color="#3b82f6" size={32} />,
            title: "Sales",
            subtitle: "Process Orders",
            route: "/order-processing",
            isHighlighted: false,
        },
        {
            id: "tables",
            icon: <Table color="#3b82f6" size={32} />,
            title: "Tables",
            subtitle: "Manage Seating",
            route: "/tables",
            isHighlighted: false,
        },
        {
            id: "previous-orders",
            icon: <History color="#3b82f6" size={32} />,
            title: "Previous Orders",
            subtitle: "Order History",
            route: "/previous-orders",
            isHighlighted: false,
        },
        {
            id: "online-orders",
            icon: <ShoppingBag color="#3b82f6" size={32} />,
            title: "Online Orders",
            subtitle: "Web & app Orders",
            route: "/online-orders",
            isHighlighted: false,
        },
        // {
        //     id: "customers",
        //     icon: <Users color="#3b82f6" size={32} />,
        //     title: "Customers",
        //     subtitle: "Customer Database",
        //     route: "/customers-list",
        //     isHighlighted: false,
        // },
        {
            id: "menu-management",
            icon: <UtensilsCrossed color="#3b82f6" size={32} />,
            title: "Menu Management",
            subtitle: "Edit Menu Items",
            route: "/menu",
            isLocked: true,
            isHighlighted: false,
        },
        {
            id: "inventory",
            icon: <Package color="#3b82f6" size={32} />,
            title: "Inventory",
            subtitle: "Stock Management",
            route: "/inventory",
            isLocked: true,
            isHighlighted: false,
        },
        {
            id: "analytics",
            icon: <BarChart3 color="#3b82f6" size={32} />,
            title: "Analytics",
            subtitle: "Sales Reports",
            route: "/analytics",
            isLocked: true,
            isHighlighted: false,
        },
        {
            id: "settings",
            icon: <Settings color="#3b82f6" size={32} />,
            title: "Settings",
            subtitle: "System Config",
            route: "/settings",
            isLocked: true,
            isHighlighted: false,
        },
    ];

    return (
        <View className="w-full h-full flex-1">
            <View className="flex-1 p-6 w-full h-full items-center justify-center">
                <View className="flex-1 w-full h-full items-center justify-center">

                    <View className="flex-row flex-wrap gap-2 w-full h-full items-center justify-center">
                        {menuItems.map((item, index) => (
                            <View key={item.id} className="w-1/4 h-1/4" style={{ marginBottom: 16 }}>
                                <MenuCard
                                    icon={item.icon}
                                    title={item.title}
                                    subtitle={item.subtitle}
                                    onPress={() => {
                                        if (item.isLocked) {
                                            handleLockedAccess(item.route);
                                        } else {
                                            router.push(item.route as any);
                                        }
                                    }}
                                    isLocked={item.isLocked}
                                    onLockPress={() => handleLockedAccess(item.route)}
                                    isHighlighted={item.isHighlighted}
                                />
                            </View>
                        ))}
                    </View>
                </View>
            </View>

            {/* Manager PIN Dialog */}
            <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
                <DialogContent className="w-fit h-fit bg-white">
                    <DialogHeader>
                        <DialogTitle className="text-center text-lg font-semibold">
                            Manager Access Required
                        </DialogTitle>
                    </DialogHeader>
                    <View className="py-4">
                        <Text className="text-center text-gray-600 mb-6">
                            Enter your manager PIN to access this feature
                        </Text>
                        <PinDisplay pinLength={currentPin.length} maxLength={4} />
                        <PinNumpad
                            onKeyPress={(input) => {
                                if (typeof input === "number") {
                                    if (currentPin.length < 4) {
                                        const newPin = currentPin + input.toString();
                                        setCurrentPin(newPin);
                                        // Auto-submit when PIN is complete
                                        if (newPin.length === 4) {
                                            setTimeout(() => {
                                                handlePinSubmit();
                                            }, 100);
                                        }
                                    }
                                } else if (input === "clear") {
                                    setCurrentPin("");
                                } else if (input === "backspace") {
                                    setCurrentPin(currentPin.slice(0, -1));
                                }
                            }}
                        />
                        <TouchableOpacity onPress={() => {
                            setPinDialogOpen(false)
                            handlePinSubmit()
                        }} className="p-3 bg-primary-400 rounded-full w-[80%] self-center mt-6">
                            <Text className="text-center text-white">Enter</Text>
                        </TouchableOpacity>
                    </View>
                </DialogContent>
            </Dialog>
        </View>
    );
};

export default MainMenu;
