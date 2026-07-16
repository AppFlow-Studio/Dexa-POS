import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const IMAGE_DURATION_MS = 6000;
const FADE_MS = 700;

type Slide =
  | { kind: "image"; uri: string }
  | { kind: "video"; uri: string };

/**
 * A single image layer that stays mounted for as long as it's in `slides`
 * (see KioskMediaCarousel for why) — only its opacity animates between 0 and
 * 1 as `active` changes. Because the underlying Image never unmounts between
 * slide changes, its bitmap is already decoded and painted by the time it's
 * asked to fade in, so there's no load-race window where the layer is
 * visible-but-blank (which read as a white flash through the transition).
 */
function ImageLayer({ uri, active }: { uri: string; active: boolean }) {
  const opacity = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    opacity.value = withTiming(active ? 1 : 0, {
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }, animatedStyle]}>
      <Image
        source={{ uri }}
        // expo-image is a third-party native component — NativeWind's
        // className->style interop isn't reliable for compound absolute-fill
        // layout on it (unlike RN's core Image), so this is sized/positioned
        // via explicit style, matching the pattern already used for
        // expo-image elsewhere in the app (OptimizedListImage.tsx).
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        // This component owns the cross-fade via the wrapping Animated.View
        // — expo-image's own transition would double-animate on top of that.
        transition={null}
      />
    </Animated.View>
  );
}

/**
 * Media-only, looping cross-fade carousel over images (timed) and a video
 * (plays to completion), used for both the idle/attract screen and the
 * ordering-screen banner in Template B. Renders nothing (null) when there's
 * no media — callers decide the fallback.
 *
 * Image slides are all permanently mounted as stacked, opacity-only layers
 * (see ImageLayer) rather than mounted/unmounted per transition — a freshly
 * mounted native Image view takes at least a frame to resolve/decode/paint
 * even on a cache hit, and doing that mount *during* the opacity ramp-in
 * produced a visible white flash before the real content appeared. Keeping
 * every image layer alive the whole time removes that race entirely: only
 * opacity ever changes. Video is the exception — only the active video slide
 * mounts a player, since keeping N video players alive simultaneously is
 * genuinely expensive, not just a decode blip.
 */
export function KioskMediaCarousel({
  imageUrls,
  videoUrl,
  style,
  pointerEvents,
}: {
  imageUrls: string[];
  videoUrl: string | null;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: "none" | "auto";
}) {
  const slides = useMemo<Slide[]>(() => {
    const imageSlides: Slide[] = imageUrls.map((uri) => ({
      kind: "image",
      uri,
    }));
    const videoSlide: Slide[] = videoUrl
      ? [{ kind: "video", uri: videoUrl }]
      : [];
    return [...imageSlides, ...videoSlide];
  }, [imageUrls, videoUrl]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  const advance = () => {
    setIndex((i) => (slides.length <= 1 ? i : (i + 1) % slides.length));
  };

  const slide = slides[index] ?? null;

  // Timed advance for image slides. Video slides advance on playback end.
  useEffect(() => {
    if (!slide || slide.kind !== "image" || slides.length <= 1) return;
    const timer = setTimeout(advance, IMAGE_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, slides.length]);

  const videoUri = slide?.kind === "video" ? slide.uri : null;
  // useCaching persists the downloaded video to disk (ExoPlayer/AVPlayer cache)
  // keyed by source — without it expo-video re-fetches over the network on
  // every remount (e.g. the idle screen resetting after each customer), even
  // though the same idle video is reused every loop. MP4 (not HLS), so the
  // iOS caching restriction on HLS sources doesn't apply here.
  const player = useVideoPlayer(
    videoUri ? { uri: videoUri, useCaching: true } : "",
    (p) => {
      p.loop = false;
      p.muted = true;
    },
  );

  useEffect(() => {
    if (!videoUri) return;
    player.play();
    const sub = player.addListener("playToEnd", () => {
      advance();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUri, player]);

  if (!slide) return null;

  return (
    <View style={[{ overflow: "hidden" }, style]} pointerEvents={pointerEvents}>
      {slides.map((s, i) =>
        s.kind === "image" ? <ImageLayer key={s.uri} uri={s.uri} active={i === index} /> : null,
      )}
      {slide.kind === "video" ? (
        <VideoView
          player={player}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          nativeControls={false}
        />
      ) : null}
    </View>
  );
}
