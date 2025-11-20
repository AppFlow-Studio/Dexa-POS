import { ToastProps } from '@/contexts/ToastContext';

// Define the type for the show function, excluding 'id' as it's generated internally
type ShowFunction = (options: Omit<ToastProps, 'id'>) => void;

// This variable will hold the actual 'show' function from the ToastContext
// It's initialized as a no-op to prevent errors if called before the context is ready.
let showToast: ShowFunction = (options) => {
  console.warn('Toast service not initialized. Called with:', options);
};

/**
 * A global service to allow triggering toasts from outside React components (e.g., Zustand stores).
 * The ToastProvider will register its 'show' function with this service.
 */
export const toastService = {
  /**
   * Used by the ToastProvider to register the actual 'show' function.
   * @param showFunc The 'show' function provided by the ToastContext.
   */
  setToast: (showFunc: ShowFunction) => {
    showToast = showFunc;
  },

  /**
   * Triggers a toast notification.
   * This function can be called from anywhere in the application.
   * @param options The options for the toast (title, message, type, onUndo, duration).
   */
  show: (options: Omit<ToastProps, 'id'>) => {
    showToast(options);
  },
};
