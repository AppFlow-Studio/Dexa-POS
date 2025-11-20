import ToastContainer from "@/components/ui/ToastContainer";
import { toastService } from "@/lib/toastService"; // Import the toastService
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect, // Import useEffect
  useState,
} from "react";

export interface ToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
  duration?: number;
  type?: "success" | "error" | "warning";
}

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

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastProps[]>([]);

  const hide = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (options: Omit<ToastProps, "id">) => {
      const id = Date.now().toString();
      const newToast: ToastProps = { id, ...options };
      setToasts((prevToasts) => [newToast, ...prevToasts]);

      if (options.duration) {
        setTimeout(() => {
          hide(id);
        }, options.duration);
      }
    },
    [hide]
  ); // Added 'hide' to dependencies

  // Register the show function with the global toastService
  useEffect(() => {
    toastService.setToast(show);
  }, [show]); // Re-register if 'show' function changes (though useCallback should keep it stable)

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};
