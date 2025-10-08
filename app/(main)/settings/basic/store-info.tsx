import SettingsSidebar from "@/components/settings/SettingsSidebar";
import StoreDetailsForm from "@/components/settings/store-info/StoreDetailsForm";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useRouter } from "expo-router";
import { Building2, Receipt, Save, Undo, User } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import BrandingForm from "./BrandingForm";
import HoursOfOperationForm from "./HoursOfOperationForm";
import TaxAndBusinessForm from "./TaxAndBusinessForm";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <View className="mb-6">
    <Text className="text-xl font-bold text-white mb-3">{title}</Text>
    {children}
  </View>
);
const StoreInfo = () => {
  const router = useRouter();
  const { employees, activeEmployeeId } = useEmployeeStore();
  const storeSettings = useStoreSettingsStore();
  const { updateField, isDirty, saveChanges, discardChanges } = storeSettings;

  // --- PERMISSION LOGIC ---
  // The first employee in the mock list is considered the admin.
  const isAdmin = useMemo(() => {
    if (employees.length > 0 && activeEmployeeId) {
      return employees[0].id === activeEmployeeId;
    }
    return false;
  }, [employees, activeEmployeeId]);

  const basicSubsections = [
    {
      id: "store-info",
      title: "Store Info",
      subtitle: "Business Details",
      route: "/settings/basic/store-info",
      icon: <Building2 color="#3b82f6" size={24} />,
    },
    {
      id: "my-profile",
      title: "My Profile",
      subtitle: "Personal Settings",
      route: "/settings/basic/my-profile",
      icon: <User color="#3b82f6" size={24} />,
    },
    {
      id: "taxes",
      title: "Taxes",
      subtitle: "Tax Configuration",
      route: "/settings/basic/taxes",
      icon: <Receipt color="#3b82f6" size={24} />,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Basic Settings"
          subsections={basicSubsections}
          currentRoute="/settings/basic/store-info"
        />

        {/* Main Content */}
        <View className="flex-1 flex-col">
          <View className="flex-row justify-between items-center mb-4">
            <View>
              <Text className="text-3xl font-bold text-white">
                Store Information
              </Text>
              <Text className="text-xl text-gray-400 mt-1">
                View or update the shared business information for this POS.
              </Text>
            </View>
            {isDirty && isAdmin && (
              <View className="flex-row gap-x-3">
                <TouchableOpacity
                  onPress={discardChanges}
                  className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-gray-700"
                >
                  <Undo size={18} color="#E5E7EB" />
                  <Text className="text-base font-bold text-white">
                    Discard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={saveChanges}
                  className="flex-row items-center gap-2 px-4 py-3 rounded-lg bg-blue-600"
                >
                  <Save size={18} color="white" />
                  <Text className="text-base font-bold text-white">
                    Save Changes
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <ScrollView className="flex-1">
            <View className="bg-[#303030] rounded-2xl border border-gray-700 p-6">
              <Section title="1. Store Details">
                <StoreDetailsForm
                  settings={storeSettings}
                  onUpdate={updateField}
                  isEditable={isAdmin}
                />
              </Section>

              <Section title="2. Hours of Operation">
                <HoursOfOperationForm
                  hours={storeSettings.hours as any}
                  onUpdate={updateField}
                  isEditable={isAdmin}
                />
              </Section>

              <Section title="4. Tax & Business Settings">
                <TaxAndBusinessForm
                  settings={storeSettings}
                  onUpdate={updateField}
                  isEditable={isAdmin}
                />
              </Section>

              <Section title="5. Branding">
                <BrandingForm isEditable={isAdmin} />
              </Section>
            </View>
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default StoreInfo;
