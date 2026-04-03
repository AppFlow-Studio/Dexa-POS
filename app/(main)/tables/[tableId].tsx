import TableOrderView from "@/components/tables/TableOrderView";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useCallback } from "react";
import { View, StyleSheet, TouchableWithoutFeedback } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export default function TableScreen() {
  const { tableId } = useLocalSearchParams<{ tableId: string }>();
  const router = useRouter();

  const backdropOpacity = useSharedValue(0);
  const cardScale = useSharedValue(0.9);
  const cardOpacity = useSharedValue(0);

  useEffect(() => {
    const enterConfig = {
      duration: 250,
      easing: Easing.out(Easing.cubic),
    };
    backdropOpacity.value = withTiming(1, enterConfig);
    cardScale.value = withTiming(1, enterConfig);
    cardOpacity.value = withTiming(1, enterConfig);
  }, []);

  const doGoBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/tables");
    }
  }, [router]);

  const handleClose = useCallback(() => {
    const exitConfig = {
      duration: 200,
      easing: Easing.in(Easing.cubic),
    };

    backdropOpacity.value = withTiming(0, exitConfig);
    cardScale.value = withTiming(0.9, exitConfig);
    cardOpacity.value = withTiming(0, exitConfig, (finished) => {
      if (finished) {
        runOnJS(doGoBack)();
      }
    });
  }, [doGoBack, backdropOpacity, cardScale, cardOpacity]);

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cardScale.value }],
    opacity: cardOpacity.value,
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.backdrop, animatedBackdropStyle]}>
        <TouchableWithoutFeedback onPress={handleClose}>
          <View style={StyleSheet.absoluteFill} />
        </TouchableWithoutFeedback>
      </Animated.View>
      <Animated.View style={[styles.card, animatedCardStyle]}>
        <TableOrderView
          tableId={typeof tableId === "string" ? tableId : ""}
          onClose={handleClose}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  card: {
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
});

