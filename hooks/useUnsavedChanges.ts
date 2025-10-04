import { useNavigation } from "expo-router";
import { useCallback, useEffect, useState } from "react";

export const useUnsavedChanges = (hasUnsavedChanges: boolean) => {
  const navigation = useNavigation();
  const [isDialogVisible, setDialogVisible] = useState(false);
  const [nextAction, setNextAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    const listener = (e: any) => {
      // If there are no changes, do nothing and allow navigation.
      if (!hasUnsavedChanges) {
        return;
      }

      // Prevent the default navigation action
      e.preventDefault();

      // Store the action that was prevented so we can run it later
      setNextAction(() => () => navigation.dispatch(e.data.action));

      // Show the confirmation dialog
      setDialogVisible(true);
    };

    // Add the listener
    navigation.addListener("beforeRemove", listener);

    // Clean up the listener when the component unmounts or dependencies change
    return () => {
      navigation.removeListener("beforeRemove", listener);
    };
  }, [navigation, hasUnsavedChanges]);

  const handleCancel = useCallback(() => {
    setNextAction(null);
    setDialogVisible(false);
  }, []);

  const handleDiscard = useCallback(() => {
    if (nextAction) {
      // Perform the stored navigation action (e.g., go back)
      nextAction();
    }
    setDialogVisible(false);
  }, [nextAction]);

  return {
    isDialogVisible,
    handleCancel,
    handleDiscard,
  };
};
