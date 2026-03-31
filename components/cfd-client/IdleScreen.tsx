import { useCFDDisplayData } from "@/contexts/CFDDisplayDataContext";
import React, { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const ROTATION_MS = 8000;
const FADE_MS = 700;

export function IdleScreen() {
  const { branding, carouselImages, latency, connectionStatus } =
    useCFDDisplayData();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [baseUri, setBaseUri] = useState<string | null>(null);
  const [overlayUri, setOverlayUri] = useState<string | null>(null);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const isTransitioningRef = useRef(false);
  const fadeOpacity = useSharedValue(0);

  useEffect(() => {
    if (!carouselImages || carouselImages.length === 0) {
      setCurrentIndex(0);
      setBaseUri(null);
      setOverlayUri(null);
      setPendingIndex(null);
      isTransitioningRef.current = false;
      fadeOpacity.value = 0;
      return;
    }

    const safeIndex = Math.min(currentIndex, carouselImages.length - 1);
    const safeUri = carouselImages[safeIndex] ?? null;

    setCurrentIndex(safeIndex);
    setBaseUri((prev) => prev ?? safeUri);
    setOverlayUri(null);
    setPendingIndex(null);
    isTransitioningRef.current = false;
    fadeOpacity.value = 0;
  }, [carouselImages]);

  useEffect(() => {
    if (!carouselImages || carouselImages.length <= 1 || !baseUri) return;

    const interval = setInterval(() => {
      if (isTransitioningRef.current) return;

      const nextIndex = (currentIndex + 1) % carouselImages.length;
      const nextUri = carouselImages[nextIndex];
      if (!nextUri || nextUri === baseUri) return;

      isTransitioningRef.current = true;
      setPendingIndex(nextIndex);
      setOverlayUri(nextUri);
      fadeOpacity.value = 0;
    }, ROTATION_MS);

    return () => clearInterval(interval);
  }, [baseUri, carouselImages, currentIndex, fadeOpacity]);

  const completeTransition = (nextIndex: number, nextUri: string) => {
    setBaseUri(nextUri);
    setCurrentIndex(nextIndex);

    // Let the base image commit before removing the overlay.
    setTimeout(() => {
      setOverlayUri(null);
      setPendingIndex(null);
      fadeOpacity.value = 0;
      isTransitioningRef.current = false;
    }, 50);
  };

  const handleOverlayLoad = () => {
    if (!overlayUri || pendingIndex === null) return;

    fadeOpacity.value = withTiming(
      1,
      { duration: FADE_MS, easing: Easing.out(Easing.cubic) },
      (finished) => {
        if (finished) {
          runOnJS(completeTransition)(pendingIndex, overlayUri);
        }
      },
    );
  };

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  const hasImages = !!carouselImages && carouselImages.length > 0;

  return (
    <View style={styles.container}>
      {hasImages && baseUri ? (
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: baseUri }}
            style={[styles.backgroundImage, StyleSheet.absoluteFill]}
            resizeMode="cover"
          />

          {overlayUri ? (
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, overlayAnimatedStyle]}
            >
              <Image
                source={{ uri: overlayUri }}
                style={styles.backgroundImage}
                resizeMode="cover"
                onLoad={handleOverlayLoad}
              />
            </Animated.View>
          ) : null}

          <View style={styles.overlay} pointerEvents="none" />
        </View>
      ) : (
        <View style={styles.textContainer}>
          <Text style={styles.welcome}>Welcome to</Text>
          <Text style={styles.restaurantName}>
            {branding?.restaurantName ?? "Our Restaurant"}
          </Text>
          {branding?.locationCode ? (
            <Text style={styles.locationCode}>{branding.locationCode}</Text>
          ) : null}
        </View>
      )}

      {__DEV__ ? (
        <View style={styles.debug}>
          <Text style={styles.debugText}>
            {connectionStatus} {latency ? `(${latency}ms)` : ""}
          </Text>
        </View>
      ) : null}
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
  welcome: {
    fontSize: 24,
    color: "#6b7280",
    marginBottom: 8,
  },
  restaurantName: {
    fontSize: 48,
    fontWeight: "700",
    color: "#ffffff",
    textAlign: "center",
  },
  locationCode: {
    fontSize: 18,
    color: "#9ca3af",
    marginTop: 8,
  },
  debug: {
    position: "absolute",
    bottom: 20,
    left: 20,
  },
  debugText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
  },
});
