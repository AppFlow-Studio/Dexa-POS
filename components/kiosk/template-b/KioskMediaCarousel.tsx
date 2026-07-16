import { useVideoPlayer, VideoView } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import { Image, View, type StyleProp, type ViewStyle } from "react-native";
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
 * Media-only, looping cross-fade carousel over images (timed) and a video
 * (plays to completion), used for both the idle/attract screen and the
 * ordering-screen banner in Template B. Both the outgoing and incoming slide
 * stay mounted during a transition so the fade is a cross-fade, not a cut.
 * Renders nothing (null) when there's no media — callers decide the fallback.
 */
export function KioskMediaCarousel({
  imageUrls,
  videoUrl,
  style,
}: {
  imageUrls: string[];
  videoUrl: string | null;
  style?: StyleProp<ViewStyle>;
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
  const [prevIndex, setPrevIndex] = useState<number | null>(null);
  const fadeOpacity = useSharedValue(0);

  useEffect(() => {
    setIndex(0);
    setPrevIndex(null);
    fadeOpacity.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.length]);

  const advance = () => {
    if (slides.length <= 1) return;
    setPrevIndex(index);
    setIndex((i) => (i + 1) % slides.length);
    fadeOpacity.value = 0;
    fadeOpacity.value = withTiming(1, {
      duration: FADE_MS,
      easing: Easing.out(Easing.cubic),
    });
  };

  const slide = slides[index] ?? null;
  const prevSlide = prevIndex !== null ? slides[prevIndex] ?? null : null;

  // Once the incoming slide has finished fading in, drop the outgoing one.
  useEffect(() => {
    if (prevIndex === null) return;
    const timer = setTimeout(() => setPrevIndex(null), FADE_MS + 50);
    return () => clearTimeout(timer);
  }, [prevIndex, index]);

  // Timed advance for image slides. Video slides advance on playback end.
  useEffect(() => {
    if (!slide || slide.kind !== "image" || slides.length <= 1) return;
    const timer = setTimeout(advance, IMAGE_DURATION_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide, slides.length]);

  const videoUri = slide?.kind === "video" ? slide.uri : null;
  const player = useVideoPlayer(videoUri ?? "", (p) => {
    p.loop = false;
    p.muted = true;
  });

  useEffect(() => {
    if (!videoUri) return;
    player.play();
    const sub = player.addListener("playToEnd", () => {
      advance();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUri, player]);

  const incomingStyle = useAnimatedStyle(() => ({
    opacity: fadeOpacity.value,
  }));

  if (!slide) return null;

  const renderSlide = (s: Slide) =>
    s.kind === "image" ? (
      <Image
        source={{ uri: s.uri }}
        className="absolute inset-0 w-full h-full"
        resizeMode="cover"
      />
    ) : (
      <VideoView
        player={player}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        contentFit="cover"
        nativeControls={false}
      />
    );

  return (
    <View style={[{ overflow: "hidden" }, style]}>
      {prevSlide ? renderSlide(prevSlide) : null}
      {prevSlide ? (
        <Animated.View
          key={`${slide.kind}-${slide.uri}-${index}`}
          style={[
            { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
            incomingStyle,
          ]}
        >
          {renderSlide(slide)}
        </Animated.View>
      ) : (
        renderSlide(slide)
      )}
    </View>
  );
}
