import { create } from "zustand";

const DEFAULT_TOAST_DURATION = 4000;
let toastCounter = 0;

// Track auto-dismiss timers by toast id so they can be cleared if the toast is
// removed early (manual hide). Otherwise the timer's closure lingers until it
// fires, and a manually-hidden toast still wakes a no-op filter.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

const clearToastTimer = (id: string) => {
  const handle = toastTimers.get(id);
  if (handle !== undefined) {
    clearTimeout(handle);
    toastTimers.delete(id);
  }
};

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
      const handle = setTimeout(() => {
        toastTimers.delete(id);
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, durationToUse);
      toastTimers.set(id, handle);
    }
  },
  hide: (id) => {
    clearToastTimer(id);
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
