import { useToast } from "@/contexts/ToastContext";

export const useUndoableToast = () => {
  const { show } = useToast();

  const showUndoableToast = (
    title: string,
    message: string,
    onUndo: () => void,
    duration: number = 5000
  ) => {
    show({ title, message, onUndo, duration });
  };

  return { showUndoableToast };
};
