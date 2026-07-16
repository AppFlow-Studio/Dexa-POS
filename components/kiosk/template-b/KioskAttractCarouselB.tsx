import { KioskMediaCarousel } from "@/components/kiosk/template-b/KioskMediaCarousel";
import {
  kioskIdleImages,
  kioskIdleVideo,
  type KioskConfig,
} from "@/types/kiosk";
import { Image, Pressable, Text, View } from "react-native";

/**
 * Template B idle/attract screen — a full-bleed, looping carousel over the
 * idle images/video for the current orientation (see KioskMediaCarousel).
 * Falls back to a plain welcome card when no idle media is configured for
 * this orientation — only in that fallback case do the logo/message/tap
 * button render; a live carousel is media-only so nothing overlays it.
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
    <Pressable
      onPress={onStart}
      className="flex-1 items-center justify-center"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {hasCarousel ? (
        <KioskMediaCarousel
          imageUrls={idleImages}
          videoUrl={idleVideo}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
      ) : null}

      {!hasCarousel && (
        <Pressable
          onPress={onStart}
          onLongPress={onLogoLongPress}
          delayLongPress={2000}
          className="items-center justify-center px-8"
        >
          {config.logoUrl ? (
            <Image
              source={{ uri: config.logoUrl }}
              className="w-40 h-40 mb-8"
              resizeMode="contain"
            />
          ) : null}

          <Text
            className="text-5xl font-bold text-center p-3"
            style={{ color: config.headerTextColor }}
          >
            {config.welcomeMessage}
          </Text>

          <View
            className="mt-10 px-10 py-4 rounded-full"
            style={{ backgroundColor: config.primaryColor }}
          >
            <Text className="text-white text-xl font-semibold">
              Tap anywhere to start
            </Text>
          </View>
        </Pressable>
      )}

      {/* Carousel case still needs a long-press target for diagnostics access,
          since the logo (its usual home) isn't rendered here. */}
      {hasCarousel && onLogoLongPress ? (
        <Pressable
          onLongPress={onLogoLongPress}
          delayLongPress={2000}
          className="absolute top-0 left-0 w-24 h-24"
        />
      ) : null}
    </Pressable>
  );
}
