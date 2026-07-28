import { Permission } from "@/stores/useSettingsStore";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFooter,
    BottomSheetScrollView,
    BottomSheetTextInput
} from "@/components/ui/bottomSheet";
import { Check, Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";

const ROLE_KEYS = ["admin", "manager", "server", "kitchen", "host"] as const;
const ROLE_LABELS = { admin: "ADMN", manager: "MANA", server: "SERV", kitchen: "KITC", host: "HOST" };

interface PermissionMatrixBottomSheetProps {
    bottomSheetRef: React.RefObject<BottomSheet | null>;
    permissions: Permission[];
    onSave: (permissions: Permission[]) => void;
    onClose: () => void;
}

export const PermissionMatrixBottomSheet: React.FC<PermissionMatrixBottomSheetProps> = ({
    bottomSheetRef,
    permissions,
    onSave,
    onClose,
}) => {
    const [searchText, setSearchText] = useState("");
    const [tempPermissions, setTempPermissions] = useState<Permission[]>([]);

    const snapPoints = useMemo(() => ["85%"], []);

    useEffect(() => {
        setTempPermissions(JSON.parse(JSON.stringify(permissions)));
    }, [permissions]);

    const filteredPermissions = useMemo(() => {
        if (!searchText.trim()) return tempPermissions;
        return tempPermissions.filter((p) =>
            p.name.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [tempPermissions, searchText]);

    const togglePermission = (permId: number, role: keyof Permission) => {
        setTempPermissions((prev) =>
            prev.map((p) => (p.id === permId ? { ...p, [role]: !p[role] } : p))
        );
    };

    const handleSave = () => {
        onSave(tempPermissions);
        onClose();
    };

    const renderBackdrop = useCallback(
        (props: any) => (
            <BottomSheetBackdrop
                {...props}
                disappearsOnIndex={-1}
                appearsOnIndex={0}
                opacity={0.7}
            />
        ),
        []
    );

    const renderFooter = useCallback(
        (props: any) => (
            <BottomSheetFooter {...props} bottomInset={0}>
                <View className="px-6 py-4 border-t border-gray-700 bg-panel">
                    <View className="flex-row gap-4">
                        <TouchableOpacity
                            onPress={onClose}
                            className="flex-1 py-4 bg-surface rounded-xl border border-gray-600 items-center justify-center"
                        >
                            <Text className="text-white font-semibold text-base">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSave}
                            className="flex-1 py-4 bg-blue-600 rounded-xl items-center justify-center"
                            style={{ shadowColor: colors.info, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
                        >
                            <Text className="text-white font-bold text-base">Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </BottomSheetFooter>
        ),
        [handleSave, onClose]
    );

    return (
        <BottomSheet
            ref={bottomSheetRef}
            index={-1}
            snapPoints={snapPoints}
            enablePanDownToClose
            onClose={onClose}
            {...bottomSheetTheme}
            handleIndicatorStyle={{ ...bottomSheetTheme.handleIndicatorStyle, width: 40 }}
            backdropComponent={renderBackdrop}
            footerComponent={renderFooter}
            keyboardBehavior="extend"
        >
            <View className="flex-1 bg-panel">
                {/* Fixed Header Section */}
                <View className="bg-panel z-10">
                    {/* Title Section */}
                    <View className="px-6 pt-4 pb-5">
                        <View className="flex-row items-center justify-between">
                            <Text className="text-2xl font-bold text-white tracking-wide">Edit Permission Matrix</Text>
                            <TouchableOpacity onPress={onClose} className="p-2 bg-surface/50 rounded-full">
                                <X size={22} color={colors.label} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Search Bar Section */}
                    <View className="px-6 pb-5">
                        <View className="flex-row items-center bg-surface rounded-xl px-4 py-3.5 border border-gray-600/80">
                            <Search size={20} color={colors.label} />
                            <BottomSheetTextInput
                                value={searchText}
                                onChangeText={setSearchText}
                                placeholder="Search permissions..."
                                placeholderTextColor={colors.muted}
                                className="flex-1 ml-3 text-white text-base"
                                style={{ color: "white", fontSize: 16 }}
                                selectionColor={colors.info}
                            />
                            {searchText.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchText("")} className="p-1.5">
                                    <X size={18} color={colors.label} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Column Headers */}
                    <View className="px-6 py-4 border-y border-gray-700 bg-surface/50 flex-row items-center">
                        <View className="flex-[2.5]">
                            <Text className="text-gray-400 text-xs font-bold uppercase tracking-wider">Permission</Text>
                        </View>
                        {ROLE_KEYS.map((role) => (
                            <View key={role} className="flex-1 items-center">
                                <Text className="text-gray-400 text-[11px] font-bold uppercase tracking-wider text-center" numberOfLines={1}>
                                    {ROLE_LABELS[role]}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>

                {/* Scrollable Content */}
                <BottomSheetScrollView
                    contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 24, paddingTop: 8 }}
                    showsVerticalScrollIndicator={false}
                >
                    {filteredPermissions.length === 0 ? (
                        <View className="py-16 items-center justify-center">
                            <Search size={56} color={colors.muted} style={{ opacity: 0.5, marginBottom: 16 }} />
                            <Text className="text-gray-400 text-base text-center">No permissions found matching "{searchText}"</Text>
                        </View>
                    ) : (
                        filteredPermissions.map((perm, index) => (
                            <View
                                key={perm.id}
                                className={`flex-row py-5 items-center ${index !== filteredPermissions.length - 1 ? "border-b border-gray-700/30" : ""
                                    }`}
                            >
                                <View className="flex-[2.5] pr-4 justify-center">
                                    <Text className="text-gray-200 text-[15px] font-medium leading-5">{perm.name}</Text>
                                </View>
                                {ROLE_KEYS.map((role) => (
                                    <TouchableOpacity
                                        key={role}
                                        onPress={() => togglePermission(perm.id, role)}
                                        className="flex-1 items-center justify-center py-2"
                                        style={{ minHeight: 50 }}
                                    >
                                        <View
                                            className={`w-10 h-10 rounded-lg items-center justify-center ${perm[role]
                                                ? "bg-green-600"
                                                : "bg-red-500/15 border border-red-500/50"
                                                }`}
                                            style={
                                                perm[role]
                                                    ? {
                                                        shadowColor: colors.success,
                                                        shadowOffset: { width: 0, height: 2 },
                                                        shadowOpacity: 0.4,
                                                        shadowRadius: 4,
                                                        elevation: 4,
                                                    }
                                                    : {}
                                            }
                                        >
                                            {perm[role] ? (
                                                <Check size={20} color="white" strokeWidth={3} />
                                            ) : (
                                                <X size={20} color={colors.danger} strokeWidth={2.5} />
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))
                    )}
                </BottomSheetScrollView>
            </View>
        </BottomSheet>
    );
};
