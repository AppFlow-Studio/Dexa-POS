import type { ToastProps } from "@/stores/useToastStore";
import { AnimatePresence } from "moti";
import React from "react";
import { View } from "react-native";
import CustomToast from "./CustomToast";

interface ToastContainerProps {
  toasts: ToastProps[];
}

const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => {
  return (
    <View
      style={{
        position: "absolute",
        bottom: 50,
        left: 0,
        right: 0,
        alignItems: "center",
        zIndex: 9999,
      }}
      pointerEvents="box-none"
    >
      <AnimatePresence>
        {toasts.map((toast) => (
          <CustomToast key={toast.id} {...toast} />
        ))}
      </AnimatePresence>
    </View>
  );
};

export default ToastContainer;
