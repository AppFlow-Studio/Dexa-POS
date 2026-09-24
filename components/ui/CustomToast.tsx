import { colors } from "@/lib/theme";
import { useToastStore } from "@/stores/useToastStore";
import {
    AlertTriangle,
    CheckCircle2,
    Undo2,
    X,
    XCircle,
} from "@/lib/icons";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Dimensions,
    PanResponder,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Reanimated, {
    FadeOut,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import type { ToastLayout } from "./toastLayout";

interface CustomToastProps {
  id: string;
  title: string;
  message: string;
  onUndo?: () => void;
  type?: "success" | "error" | "warning";
  layout: ToastLayout;
}

const SWIPE_THRESHOLD = 80;

const CustomToast: React.FC<CustomToastProps> = ({
  id,
  title,
  message,
  onUndo,
  type = "success",
  layout,
}) => {
  const hide = useToastStore((s) => s.hide);

  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 10 &&
        Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        // Only allow rightward swipe (positive dx) or slight resistance on left
        if (gestureState.dx > 0) {
          translateX.setValue(gestureState.dx);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > SWIPE_THRESHOLD) {
          // Swipe far enough — dismiss with animation
          Animated.timing(translateX, {
            toValue: Dimensions.get("window").width,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            hide(id);
          });
        } else {
          // Snap back
          Animated.spring(translateX, {
            toValue: 0,
            useNativeDriver: true,
            damping: 15,
          }).start();
        }
      },
    }),
  ).current;

  // Enter animation (replaces moti MotiView `from`/`animate`): fade + slight
  // slide-in on mount, driven by reanimated. Compact (undo) slides up from
  // below (+12); the full toast slides down from above (-20), matching the
  // previous moti behavior.
  const enterOpacity = useSharedValue(0);
  const enterTranslateY = useSharedValue(onUndo ? 12 : -20);
  useEffect(() => {
    const duration = onUndo ? 200 : 300;
    enterOpacity.value = withTiming(1, { duration });
    enterTranslateY.value = withTiming(0, { duration });
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const enterStyle = useAnimatedStyle(() => ({
    opacity: enterOpacity.value,
    transform: [{ translateY: enterTranslateY.value }],
  }));

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
    }
    hide(id);
  };

  const handleDismiss = () => {
    hide(id);
  };

  const isError = type === "error";
  const isWarning = type === "warning";

  const borderColor = isError ? "#ef4444" : isWarning ? "#eab308" : "#22c55e";

  const Icon = isError ? (
    <XCircle size={layout.iconSize} color={colors.danger} />
  ) : isWarning ? (
    <AlertTriangle size={layout.iconSize} color={colors.warning} />
  ) : (
    <CheckCircle2 size={layout.iconSize} color={colors.success} />
  );

  // Compact layout when undo is present (e.g. KDS ticket advance)
  if (onUndo) {
    return (
      <Animated.View
        style={{
          transform: [{ translateX }],
        }}
        {...panResponder.panHandlers}
      >
        <Reanimated.View
          style={[
            {
              width: layout.compactWidth,
              marginBottom: 6,
            },
            enterStyle,
          ]}
          exiting={FadeOut.duration(200)}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#1f2937",
              borderWidth: 1,
              borderColor,
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            {React.cloneElement(
              Icon as React.ReactElement<{ size?: number; color?: string }>,
              { size: 14 }
            )}
            <View style={{ flex: 1, marginLeft: 6 }}>
              <Text
                style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={{ color: "#9ca3af", fontSize: 9, marginTop: 1 }}
                numberOfLines={1}
              >
                {message} ·{" "}
                {new Date().toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleUndo}
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "rgba(234,179,8,0.2)",
                borderWidth: 1,
                borderColor: "rgba(234,179,8,0.3)",
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginLeft: 8,
              }}
            >
              <Undo2 size={11} color={colors.warning} />
              <Text
                style={{
                  color: "#facc15",
                  fontSize: 10,
                  fontWeight: "700",
                  marginLeft: 3,
                }}
              >
                UNDO
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDismiss} style={{ marginLeft: 6 }}>
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>
        </Reanimated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={{
        transform: [{ translateX }],
      }}
      {...panResponder.panHandlers}
    >
      <Reanimated.View
        style={[
          {
            width: layout.width,
            marginBottom: 10,
          },
          enterStyle,
        ]}
        exiting={FadeOut.duration(300)}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#1f2937",
            borderWidth: 1,
            borderColor,
            borderRadius: layout.radius,
            padding: layout.padding,
          }}
        >
          {Icon}
          <View style={{ flex: 1, marginHorizontal: layout.gap }}>
            <Text
              style={{
                color: "#fff",
                fontWeight: "700",
                fontSize: layout.titleSize,
                lineHeight: layout.titleLineHeight,
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: "#d1d5db",
                fontSize: layout.messageSize,
                lineHeight: layout.messageLineHeight,
                marginTop: layout.messageGap,
              }}
            >
              {message}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            hitSlop={8}
          >
            <X size={layout.closeSize} color={colors.label} />
          </TouchableOpacity>
        </View>
      </Reanimated.View>
    </Animated.View>
  );
};

export default CustomToast;
