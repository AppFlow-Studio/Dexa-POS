import type { ToastProps } from "@/stores/useToastStore";
import { useIsKiosk, useKioskUiScale, useUiScale } from "@/lib/uiScale";
import React from "react";
import { useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CustomToast from "./CustomToast";
import { toastLayout } from "./toastLayout";

interface ToastContainerProps {
  toasts: ToastProps[];
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const posScale = useUiScale();
  const kioskScale = useKioskUiScale();
  // The toast layer sits at the app root, outside KioskScaleProvider, so on a
  // kiosk it would otherwise take the POS scale - which isn't orientation-aware
  // and puts a 1080x1920 panel below 1.0.
  const scale = useIsKiosk() ? kioskScale : posScale;
  const layout = toastLayout(width, scale, insets.top);

  return (
    <View
      style={{
        position: "absolute",
        top: layout.top,
        right: layout.margin,
        alignItems: "flex-end",
        zIndex: 9999,
      }}
      pointerEvents="box-none"
    >
      {toasts.map((toast) => (
        <CustomToast key={toast.id} {...toast} layout={layout} />
      ))}
    </View>
  );
};

export default ToastContainer;
