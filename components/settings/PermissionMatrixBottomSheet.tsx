import { Permission } from "@/stores/useSettingsStore";
import BottomSheet, {
    BottomSheetBackdrop,
    BottomSheetFooter,
    BottomSheetScrollView,
    BottomSheetTextInput
} from "@gorhom/bottom-sheet";
import { Check, Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

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
                <View className="px-6 py-4 border-t border-gray-700 bg-[#303030]">
                    <View className="flex-row gap-4">
                        <TouchableOpacity
                            onPress={onClose}
                            className="flex-1 py-4 bg-[#404040] rounded-xl border border-gray-600 items-center justify-center"
                        >
                            <Text className="text-white font-semibold text-base">Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={handleSave}
                            className="flex-1 py-4 bg-blue-600 rounded-xl items-center justify-center"
                            style={{ shadowColor: "#3b82f6", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
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
            handleIndicatorStyle={{ backgroundColor: "#525252", width: 40 }}
            backgroundStyle={{ backgroundColor: "#303030" }}
            backdropComponent={renderBackdrop}
            footerComponent={renderFooter}
            keyboardBehavior="extend"
        >
            <View className="flex-1 bg-[#303030]">
                {/* Fixed Header Section */}
                <View className="bg-[#303030] z-10">
                    {/* Title Section */}
                    <View className="px-6 pt-4 pb-5">
                        <View className="flex-row items-center justify-between">
                            <Text className="text-2xl font-bold text-white tracking-wide">Edit Permission Matrix</Text>
                            <TouchableOpacity onPress={onClose} className="p-2 bg-[#404040]/50 rounded-full">
                                <X size={22} color="#9ca3af" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Search Bar Section */}
                    <View className="px-6 pb-5">
                        <View className="flex-row items-center bg-[#404040] rounded-xl px-4 py-3.5 border border-gray-600/80">
                            <Search size={20} color="#9ca3af" />
                            <BottomSheetTextInput
                                value={searchText}
                                onChangeText={setSearchText}
                                placeholder="Search permissions..."
                                placeholderTextColor="#6b7280"
                                className="flex-1 ml-3 text-white text-base"
                                style={{ color: "white", fontSize: 16 }}
                                selectionColor="#3b82f6"
                            />
                            {searchText.length > 0 && (
                                <TouchableOpacity onPress={() => setSearchText("")} className="p-1.5">
                                    <X size={18} color="#9ca3af" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Column Headers */}
                    <View className="px-6 py-4 border-y border-gray-700 bg-[#353535]/50 flex-row items-center">
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
                            <Search size={56} color="#4b5563" style={{ opacity: 0.5, marginBottom: 16 }} />
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
                                                        shadowColor: "#16a34a",
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
                                                <X size={20} color="#ef4444" strokeWidth={2.5} />
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
