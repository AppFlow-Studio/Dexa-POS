import ToastContainer from "@/components/ui/ToastContainer";
import { toastService } from "@/lib/toastService";
import { useToastStore } from "@/stores/useToastStore";
import type { ToastProps as StoreToastProps } from "@/stores/useToastStore";
import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
} from "react";

// Re-export ToastProps from the store for backward compatibility
export type ToastProps = StoreToastProps;

interface ToastContextType {
  show: (options: Omit<ToastProps, "id">) => void;
  hide: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
};

// Standalone component that subscribes to toast store independently
// This prevents children from re-rendering when toasts change
const ToastRenderer = () => {
  const toasts = useToastStore((s) => s.toasts);
  return <ToastContainer toasts={toasts} />;
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  // Stable references from the store (these never change)
  const show = useToastStore((s) => s.show);
  const hide = useToastStore((s) => s.hide);

  // Register the show function with the global toastService
  useEffect(() => {
    toastService.setToast(show);
  }, [show]);

  // Stable context value - show/hide are store functions that never change
  const contextValue = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastRenderer />
    </ToastContext.Provider>
  );
};
