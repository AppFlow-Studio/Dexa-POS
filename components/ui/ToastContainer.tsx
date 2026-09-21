import { computeAuthUiScale, FixedUiScaleProvider, isCompactViewport } from "@/lib/uiScale";
import type { ToastProps } from "@/stores/useToastStore";
import React from "react";
import { useWindowDimensions, View } from "react-native";
import CustomToast from "./CustomToast";

interface ToastContainerProps {
  toasts: ToastProps[];
}

/**
 * Top-right stack on a landscape tablet. On a phone or portrait kiosk the
 * fixed 380dp card would hang off the left edge and the root scale (0.6 on
 * a phone) would shrink its text, so there the toasts span the width and
 * read at the same pinned scale the auth screens use.
 */
const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  const { width, height } = useWindowDimensions();
  const compact = isCompactViewport(width, height);
  return (
    <View
      style={{
        position: "absolute",
        top: compact ? 12 : 50,
        right: 16,
        left: compact ? 16 : undefined,
        alignItems: compact ? "stretch" : "flex-end",
        zIndex: 9999,
      }}
      pointerEvents="box-none"
    >
      <FixedUiScaleProvider scale={compact ? computeAuthUiScale(width, height) : null} fill={false} pointerEvents="box-none">
        {toasts.map((toast) => (
          <CustomToast key={toast.id} {...toast} compact={compact} />
        ))}
      </FixedUiScaleProvider>
    </View>
  );
};

export default ToastContainer;
