import React from "react";
import { View } from "react-native";
import { AnimatePresence } from "moti";
import CustomToast from "./CustomToast";
import { ToastProps } from "@/contexts/ToastContext";

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
