import PaymentBottomSheet from "@/components/bill/PaymentBottomSheet";
import Header from "@/components/Header";
import NotificationBottomSheet from "@/components/notifications/NotificationBottomSheet";
import { useNotificationSheetStore } from "@/stores/useNotificationSheetStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useAuth } from "@clerk/clerk-expo";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Redirect, Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SecureStore from 'expo-secure-store'
import { TokenCache } from '@clerk/clerk-expo'
export default function MainLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const notificationSheetRef = useRef<BottomSheetMethods>(null);
  const paymentBottomSheetRef = useRef<BottomSheetMethods>(null);
  const { setSheetRef } = useNotificationSheetStore();

  useEffect(() => {
    setSheetRef(notificationSheetRef as React.RefObject<BottomSheetMethods>);
  }, [setSheetRef]);

  useEffect(() => {
    usePaymentStore
      .getState()
      .setPaymentBottomSheetRef(
        paymentBottomSheetRef as React.RefObject<BottomSheetMethods>
      );
  }, [paymentBottomSheetRef]);

  // Show loading indicator while Clerk is loading
  if (!isLoaded) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Redirect to login if user is not signed in
  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <SafeAreaView edges={["top"]} className="flex-1 bg-[#212121]">
        <StatusBar style={"light"} translucent />

        <View className="flex-1 flex-row">
          {/* The Sidebar is now a self-contained component that handles its own state */}
          {/* <Sidebar /> */}
          {/* <ModifierSidebar /> */}
          <View className="flex-1 flex-col">
            <View className="py-3 px-4 z-50">
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
        {/* Payment sheet needs highest z-index to overlay header */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
          }}
          pointerEvents="box-none"
        >
          <PaymentBottomSheet ref={paymentBottomSheetRef} />
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
