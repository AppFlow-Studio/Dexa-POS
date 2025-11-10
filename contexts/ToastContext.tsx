import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import ToastContainer from "@/components/ui/ToastContainer";

export interface ToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
  duration?: number;
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

  const show = useCallback((options: Omit<ToastProps, "id">) => {
    const id = Date.now().toString();
    const newToast: ToastProps = { id, ...options };
    setToasts((prevToasts) => [newToast, ...prevToasts]);

    if (options.duration) {
      setTimeout(() => {
        hide(id);
      }, options.duration);
    }
  }, []);

  const hide = useCallback((id: string) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show, hide }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
};
