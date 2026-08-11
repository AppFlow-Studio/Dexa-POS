import { KioskSecretAccessCorner } from "@/components/kiosk/shared/KioskSecretAccessCorner";
import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import { kioskIdleImages, kioskIdleVideo, type KioskConfig } from "@/types/kiosk";
import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * Idle / attract screen — shared by every template. Shown whenever no customer
 * is mid-order; tapping it starts a session. This is the only screen where a
 * pending config change is allowed to take effect (the entry screen flushes
 * pending → config on idle), so the customer-facing theme never changes during
 * an order.
 *
 * When idle images/video are configured for the current orientation, it shows a
 * full-bleed, looping cross-fade carousel over that media (see
 * KioskMediaCarousel) — every ~6s per image, like the CFD. A live carousel is
 * media-only, so nothing overlays it. When no idle media is set, it falls back
 * to the branded logo / welcome-message / "tap to start" card.
 *
 * Structure: a full-screen "tap anywhere to start" Pressable underlay (the
 * carousel is pointerEvents=none so taps pass through it), the content on top,
 * and the secret admin-access corner as a top-level sibling so five taps in the
 * top-left always open the manager-PIN-gated settings.
 */
export function KioskAttractScreen({
  config,
  onStart,
  onLogoLongPress,
}: {
  config: KioskConfig;
  onStart: () => void;
  /** Opens the manager-PIN-gated kiosk settings (via the secret corner). */
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
