import { create } from "zustand";

const DEFAULT_TOAST_DURATION = 4000;
let toastCounter = 0;

export interface ToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
  duration?: number;
  type?: "success" | "error" | "warning";
}

interface ToastState {
  toasts: ToastProps[];
  show: (options: Omit<ToastProps, "id">) => void;
  hide: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  show: (options) => {
    const id = `toast-${Date.now()}-${++toastCounter}`;
    const newToast: ToastProps = { id, ...options };
    set((state) => ({ toasts: [newToast, ...state.toasts] }));

    const durationToUse = options.duration ?? DEFAULT_TOAST_DURATION;
    if (durationToUse) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, durationToUse);
    }
  },
  hide: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
