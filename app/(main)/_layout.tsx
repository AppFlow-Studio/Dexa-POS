import Header from "@/components/Header";
import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
export default function MainLayout() {
  const notificationSheetRef = useRef<BottomSheetMethods>(null);
  const { setSheetRef } = useNotificationSheetStore();

  useEffect(() => {
    setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSheetRef]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
      className="flex-1"
    >
      <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
        <StatusBar style={"light"} translucent />

        <View className="flex-1 flex-row">
          {/* The Sidebar is now a self-contained component that handles its own state */}
          {/* <Sidebar /> */}
          {/* <ModifierSidebar /> */}
          <View className="flex-1 flex-col">
            <View className="p-2 px-4">
              <Header />
            </View>
            <Slot />
          </View>
        </View>
        <NotificationBottomSheet
          bottomSheetRef={
            notificationSheetRef as React.RefObject<BottomSheetMethods>
          }
          onClose={() => notificationSheetRef.current?.close()}
        />
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
