import { KioskSecretAccessCorner } from "@/components/kiosk/shared/KioskSecretAccessCorner";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import {
  kioskIdleImages,
  kioskIdleVideo,
  type KioskConfig,
} from "@/types/kiosk";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Template B idle/attract screen — a full-bleed, looping carousel over the
 * idle images/video for the current orientation (see KioskMediaCarousel).
 * Falls back to a plain welcome card when no idle media is configured for
 * this orientation — only in that fallback case do the logo/message/tap
 * button render; a live carousel is media-only so nothing overlays it.
 *
 * A full-screen Pressable underlay handles "tap anywhere to start" (the
 * carousel is pointerEvents=none so taps pass through it). The secret
 * admin-access corner sits ON TOP as a top-level sibling so five taps in the
 * top-left always open the manager-PIN-gated settings.
 */
export function KioskAttractCarouselB({
  config,
  onStart,
  onLogoLongPress,
}: {
  config: KioskConfig;
  onStart: () => void;
  onLogoLongPress?: () => void;
}) {
  const idleImages = kioskIdleImages(config);
  const idleVideo = kioskIdleVideo(config);
  const hasCarousel = idleImages.length > 0 || !!idleVideo;

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Tap-anywhere-to-start underlay. */}
      <Pressable
        onPress={onStart}
        style={StyleSheet.absoluteFill}
        android_disableSound
      />

      {hasCarousel ? (
        <KioskMediaCarousel
          imageUrls={idleImages}
          videoUrl={idleVideo}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          pointerEvents="none"
        />
      ) : (
        <View
          pointerEvents="box-none"
          className="flex-1 items-center justify-center px-8"
        >
          {config.logoUrl ? (
            <Image
              source={{ uri: config.logoUrl }}
              style={{ width: 160, height: 160, marginBottom: 32 }}
              contentFit="contain"
              cachePolicy="memory-disk"
            />
          ) : null}

          <Text
            className="text-5xl font-bold text-center p-3"
            style={{ color: config.headerTextColor }}
          >
            {config.welcomeMessage}
          </Text>

          <Pressable
            onPress={onStart}
            className="mt-10 px-10 py-4 rounded-full"
            style={{ backgroundColor: config.primaryColor }}
          >
            <Text className="text-white text-xl font-semibold">
              Tap anywhere to start
            </Text>
          </Pressable>
        </View>
      )}

      {/* Secret admin access — 5 taps in the top-left corner. Sits above the
          carousel (pointerEvents=none), so it always captures its taps. */}
      {onLogoLongPress ? (
        <KioskSecretAccessCorner
          onTrigger={onLogoLongPress}
          tint={config.headerTextColor}
        />
      ) : null}
    </View>
  );
}
