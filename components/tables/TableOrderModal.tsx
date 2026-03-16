import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { PortalHost } from "@rn-primitives/portal";
import { ToastProvider } from "@/contexts/ToastContext";
import { LoadingProvider } from "@/contexts/LoadingContext";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import TableOrderView from "./TableOrderView";

interface TableOrderModalProps {
  tableId: string | null;
  onClose: () => void;
}

const TableOrderModal = ({ tableId, onClose }: TableOrderModalProps) => {
  const [internalVisible, setInternalVisible] = useState(false);
  const lastTableIdRef = useRef<string | null>(null);

  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

  const handleAnimationEnd = useCallback(() => {
    setInternalVisible(false);
  }, []);

  // When tableId changes: trigger open or close
  useEffect(() => {
    if (tableId) {
      lastTableIdRef.current = tableId;
      setInternalVisible(true);
    } else if (internalVisible) {
      // Run exit animation
      const exitConfig = {
        duration: 200,
        easing: Easing.in(Easing.cubic),
      };

      backdropOpacity.value = withTiming(0, exitConfig);
      cardScale.value = withTiming(0.9, exitConfig);
      cardOpacity.value = withTiming(0, exitConfig, (finished) => {
        if (finished) {
          runOnJS(handleAnimationEnd)();
        }
      });
    }
  }, [tableId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When internalVisible becomes true (modal mounted): run enter animation
  useEffect(() => {
    if (internalVisible && tableId) {
      // Reset to start values (in case of rapid open/close)
      backdropOpacity.value = 0;
      cardScale.value = 0.9;
      cardOpacity.value = 0;

      const enterConfig = {
        duration: 250,
        easing: Easing.out(Easing.cubic),
      };

      backdropOpacity.value = withTiming(1, enterConfig);
      cardScale.value = withTiming(1, enterConfig);
      cardOpacity.value = withTiming(1, enterConfig);
    }
  }, [internalVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  // The tableId to render: use current if available, otherwise last valid one (during exit)
  const renderTableId = tableId ?? lastTableIdRef.current;

  return (
    <Modal
      visible={internalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <BottomSheetModalProvider>
          <ToastProvider>
            <LoadingProvider>
              <Animated.View
                style={[
                  {
                    flex: 1,
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    justifyContent: "center",
                    alignItems: "center",
                  },
                  animatedBackdropStyle,
                ]}
              >
                <Animated.View
                  style={[
                    {
                      width: "95%",
                      height: "95%",
                      borderRadius: 16,
                      overflow: "hidden",
                      elevation: 24,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 8 },
                      shadowOpacity: 0.4,
                      shadowRadius: 24,
                    },
                    animatedCardStyle,
                  ]}
                >
                  {renderTableId && (
                    <TableOrderView
                      key={renderTableId}
                      tableId={renderTableId}
                      onClose={onClose}
                    />
                  )}
                </Animated.View>
                <PortalHost />
              </Animated.View>
            </LoadingProvider>
          </ToastProvider>
        </BottomSheetModalProvider>
      </GestureHandlerRootView>
    </Modal>
  );
};

export default TableOrderModal;
