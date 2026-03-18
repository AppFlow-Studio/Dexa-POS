import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React, { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export function IdleScreen() {
  const { branding, carouselImages, latency, connectionStatus } = useCFDDisplayData();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextIndex, setNextIndex] = useState(0);
  const crossFadeOpacity = useSharedValue(0);

  useEffect(() => {
    if (!carouselImages || carouselImages.length <= 1) return;

    const interval = setInterval(() => {
      const next = (currentIndex + 1) % carouselImages.length;
      setNextIndex(next);

      crossFadeOpacity.value = withTiming(1, { duration: 1000 }, (finished) => {
        if (finished) {
          runOnJS(handleSwap)(next);
        }
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [currentIndex, carouselImages]);

  const handleSwap = (newCurrent: number) => {
    setCurrentIndex(newCurrent);
    crossFadeOpacity.value = 0;
  };

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: crossFadeOpacity.value,
  }));

  const hasImages = carouselImages && carouselImages.length > 0;
  const currentUri = hasImages ? carouselImages[currentIndex] : null;
  const nextUri =
    hasImages && carouselImages.length > 1 ? carouselImages[nextIndex] : null;

  return (
    <View style={styles.container}>
      {hasImages ? (
        <View style={styles.imageContainer}>
          <Image
            key={`img-${currentIndex}`}
            source={{ uri: currentUri! }}
            style={[styles.backgroundImage, StyleSheet.absoluteFill]}
            resizeMode="cover"
          />
          {nextUri && (
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
              <Image
                key={`img-${nextIndex}`}
                source={{ uri: nextUri }}
                style={styles.backgroundImage}
                resizeMode="cover"
              />
            </Animated.View>
          )}
          <View style={styles.overlay} />
        </View>
      ) : (
        <View style={styles.textContainer}>
          <Text style={styles.welcome}>Welcome to</Text>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? "Our Restaurant"}
          </Text>
          {branding?.locationCode && (
            <Text style={styles.locationCode}>{branding.locationCode}</Text>
          )}
        </View>
      )}

      {__DEV__ && (
        <View style={styles.debug}>
          <Text style={styles.debugText}>
            {connectionStatus} {latency ? `(${latency}ms)` : ""}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  imageContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  backgroundImage: {
    width: "100%",
    height: "100%",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  textContainer: {
    alignItems: "center",
  },
  welcome: { fontSize: 24, color: "#6b7280", marginBottom: 8 },
  restaurantName: {
    fontSize: 48,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  locationCode: { fontSize: 18, color: "#9ca3af", marginTop: 8 },
  debug: { position: "absolute", bottom: 20, left: 20 },
  debugText: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
});
