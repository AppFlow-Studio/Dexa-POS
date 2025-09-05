import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRouter } from "expo-router";
import {
    Building2,
    CreditCard,
    Database,
    Lock,
    Monitor,
    Palette,
    Printer,
    Receipt,
    RefreshCcw,
    Settings,
    Smartphone,
    Store,
    User,
    Wrench
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SettingsCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onPress: () => void;
    isLocked?: boolean;
    onLockPress?: () => void;
}

const SettingsCard: React.FC<SettingsCardProps> = ({
    icon,
    title,
    subtitle,
    onPress,
    isLocked = false,
    onLockPress,
}) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            className="w-full h-full rounded-2xl border border-gray-200 p-4 bg-white"
        >
            <View className="justify-center h-full w-full flex">
                <View className="flex-row justify-center items-center w-full h-full relative">
                    <View className="w-full h-full flex items-center justify-center">
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

const SettingsScreen: React.FC = () => {
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

    const settingsCategories = [
        {
            id: "basic",
            icon: <Settings color="#3b82f6" size={32} />,
            title: "Basic",
            subtitle: "Store Info & Profile",
            route: "/settings/basic/store-info",
            isLocked: false,
        },
        {
            id: "appearance",
            icon: <Palette color="#3b82f6" size={32} />,
            title: "Appearance & Security",
            subtitle: "Themes & Login",
            route: "/settings/appearance-and-security/security-and-login",
            isLocked: false,
        },
        {
            id: "hardware",
            icon: <Printer color="#3b82f6" size={32} />,
            title: "Hardware & Connection",
            subtitle: "Printers & Displays",
            route: "/settings/hardware-connection/printer",
            isLocked: false,
        },
        {
            id: "store-operation",
            icon: <Store color="#3b82f6" size={32} />,
            title: "Store Operation",
            subtitle: "End of Day & Receipts",
            route: "/settings/store-operation/end-of-day",
            isLocked: true,
        },
        {
            id: "system-support",
            icon: <Wrench color="#3b82f6" size={32} />,
            title: "System & Support",
            subtitle: "Device & Reset",
            route: "/settings/system-and-support/device-and-support",
            isLocked: false,
        },
    ];

    const basicSettings = [
        {
            id: "store-info",
            icon: <Building2 color="#3b82f6" size={24} />,
            title: "Store Info",
            subtitle: "Business Details",
            route: "/settings/basic/store-info",
        },
        {
            id: "my-profile",
            icon: <User color="#3b82f6" size={24} />,
            title: "My Profile",
            subtitle: "Personal Settings",
            route: "/settings/basic/my-profile",
        },
        {
            id: "category",
            icon: <Database color="#3b82f6" size={24} />,
            title: "Categories",
            subtitle: "Menu Categories",
            route: "/settings/basic/category",
        },
        {
            id: "modifiers",
            icon: <Settings color="#3b82f6" size={24} />,
            title: "Modifiers",
            subtitle: "Item Customizations",
            route: "/settings/basic/modifiers",
        },
        {
            id: "taxes",
            icon: <Receipt color="#3b82f6" size={24} />,
            title: "Taxes",
            subtitle: "Tax Configuration",
            route: "/settings/basic/taxes",
        },
    ];

    const hardwareSettings = [
        {
            id: "printer",
            icon: <Printer color="#3b82f6" size={24} />,
            title: "Printers",
            subtitle: "Receipt & Kitchen",
            route: "/settings/hardware-connection/printer",
        },
        {
            id: "printer-rules",
            icon: <Receipt color="#3b82f6" size={24} />,
            title: "Printer Rules",
            subtitle: "Print Configuration",
            route: "/settings/hardware-connection/printer-rules",
        },
        {
            id: "customer-display",
            icon: <Monitor color="#3b82f6" size={24} />,
            title: "Customer Display",
            subtitle: "Order Display",
            route: "/settings/hardware-connection/customer-display",
        },
        {
            id: "payment-terminal",
            icon: <CreditCard color="#3b82f6" size={24} />,
            title: "Payment Terminal",
            subtitle: "Card Processing",
            route: "/settings/hardware-connection/payment-terminal",
        },
    ];

    const storeOperationSettings = [
        {
            id: "end-of-day",
            icon: <Store color="#3b82f6" size={24} />,
            title: "End of Day",
            subtitle: "Daily Operations",
            route: "/settings/store-operation/end-of-day",
            isLocked: true,
        },
        {
            id: "receipt-rules",
            icon: <Receipt color="#3b82f6" size={24} />,
            title: "Receipt Rules",
            subtitle: "Receipt Configuration",
            route: "/settings/store-operation/receipt-rules",
            isLocked: true,
        },
        {
            id: "sync-status",
            icon: <RefreshCcw color="#3b82f6" size={24} />,
            title: "Sync Status",
            subtitle: "Data Synchronization",
            route: "/settings/store-operation/sync-status",
            isLocked: true,
        },
    ];

    const systemSettings = [
        {
            id: "device-support",
            icon: <Smartphone color="#3b82f6" size={24} />,
            title: "Device & Support",
            subtitle: "System Information",
            route: "/settings/system-and-support/device-and-support",
        },
        {
            id: "reset-application",
            icon: <Wrench color="#3b82f6" size={24} />,
            title: "Reset Application",
            subtitle: "Factory Reset",
            route: "/settings/system-and-support/reset-application",
            isLocked: true,
        },
    ];

    return (
        <View className="w-full h-full flex-1 bg-gray-50">
            <View className="flex-1 p-6 w-full h-full">
                {/* Main Categories */}
                <View className="mb-8 h-full w-full justify-center items-center flex">
                    <View className="flex-row flex-wrap gap-2 w-full h-full items-center justify-center">
                        {settingsCategories.map((category) => (
                            <View key={category.id} className="w-1/3 h-1/4" style={{ marginBottom: 16 }}>
                                <SettingsCard
                                    icon={category.icon}
                                    title={category.title}
                                    subtitle={category.subtitle}
                                    onPress={() => {
                                        if (category.isLocked) {
                                            handleLockedAccess(category.route);
                                        } else {
                                            router.push(category.route as any);
                                        }
                                    }}
                                    isLocked={category.isLocked}
                                    onLockPress={() => handleLockedAccess(category.route)}
                                />
                            </View>
                        ))}
                    </View>
                </View>

                {/* Basic Settings */}
                {/* <View className="mb-8">
                    <Text className="text-xl font-bold text-gray-800 mb-4">Basic Settings</Text>
                    <View className="flex-row flex-wrap gap-4 w-full">
                        {basicSettings.map((setting) => (
                            <View key={setting.id} className="w-1/5" style={{ marginBottom: 16 }}>
                                <SettingsCard
                                    icon={setting.icon}
                                    title={setting.title}
                                    subtitle={setting.subtitle}
                                    onPress={() => router.push(setting.route as any)}
                                />
                            </View>
                        ))}
                    </View>
                </View> */}

                {/* Hardware Settings */}
                {/* <View className="mb-8">
                    <Text className="text-xl font-bold text-gray-800 mb-4">Hardware & Connection</Text>
                    <View className="flex-row flex-wrap gap-4 w-full">
                        {hardwareSettings.map((setting) => (
                            <View key={setting.id} className="w-1/4" style={{ marginBottom: 16 }}>
                                <SettingsCard
                                    icon={setting.icon}
                                    title={setting.title}
                                    subtitle={setting.subtitle}
                                    onPress={() => router.push(setting.route as any)}
                                />
                            </View>
                        ))}
                    </View>
                </View> */}

                {/* Store Operation Settings */}
                {/* <View className="mb-8">
                    <Text className="text-xl font-bold text-gray-800 mb-4">Store Operation</Text>
                    <View className="flex-row flex-wrap gap-4 w-full">
                        {storeOperationSettings.map((setting) => (
                            <View key={setting.id} className="w-1/3" style={{ marginBottom: 16 }}>
                                <SettingsCard
                                    icon={setting.icon}
                                    title={setting.title}
                                    subtitle={setting.subtitle}
                                    onPress={() => {
                                        if (setting.isLocked) {
                                            handleLockedAccess(setting.route);
                                        } else {
                                            router.push(setting.route as any);
                                        }
                                    }}
                                    isLocked={setting.isLocked}
                                    onLockPress={() => handleLockedAccess(setting.route)}
                                />
                            </View>
                        ))}
                    </View>
                </View> */}

                {/* System Settings */}
                {/* <View className="mb-8">
                    <Text className="text-xl font-bold text-gray-800 mb-4">System & Support</Text>
                    <View className="flex-row flex-wrap gap-4 w-full">
                        {systemSettings.map((setting) => (
                            <View key={setting.id} className="w-1/2" style={{ marginBottom: 16 }}>
                                <SettingsCard
                                    icon={setting.icon}
                                    title={setting.title}
                                    subtitle={setting.subtitle}
                                    onPress={() => {
                                        if (setting.isLocked) {
                                            handleLockedAccess(setting.route);
                                        } else {
                                            router.push(setting.route as any);
                                        }
                                    }}
                                    isLocked={setting.isLocked}
                                    onLockPress={() => handleLockedAccess(setting.route)}
                                />
                            </View>
                        ))}
                    </View>
                </View> */}
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

export default SettingsScreen;
