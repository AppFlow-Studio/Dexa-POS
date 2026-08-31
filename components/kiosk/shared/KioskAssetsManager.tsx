import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { toastService } from "@/lib/toastService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import { useAuth } from "@clerk/clerk-expo";
import * as FileSystem from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
import { Film, ImagePlus, Plus, RefreshCw, Trash2, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const TEAL = "#0D9488";
const MAX_PER_GROUP = 5;
// Kept in sync with MAX_VIDEO_SIZE_BYTES in the website's cdn-upload edge function.
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;

// Videos are streamed straight to the edge function (see uploadVideoToCdn), which
// needs the function URL + anon key directly rather than going through supabase-js.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

/** Array-backed media groups on the kiosk profile → their DB columns. */
type GroupKey =
  | "idleImagesVertical"
  | "idleImagesHorizontal"
  | "orderBannerImagesVertical"
  | "orderBannerImagesHorizontal";

/** Single-value idle video slots (one per orientation) → their DB columns. */
type VideoKey = "idleVideoVertical" | "idleVideoHorizontal";

const COLUMN: Record<GroupKey | VideoKey | "logoUrl", string> = {
  logoUrl: "logo_url",
  idleImagesVertical: "idle_images_vertical",
  idleImagesHorizontal: "idle_images_horizontal",
  orderBannerImagesVertical: "order_banner_images_vertical",
  orderBannerImagesHorizontal: "order_banner_images_horizontal",
  idleVideoVertical: "idle_video_vertical",
  idleVideoHorizontal: "idle_video_horizontal",
};

const VIDEO_SLOTS: {
  key: VideoKey;
  title: string;
  sub: string;
  ratioLabel: string;
  aspect: [number, number];
}[] = [
  {
    key: "idleVideoVertical",
    title: "Idle video · Vertical",
    sub: "Plays after the portrait idle images, muted and looping.",
    ratioLabel: "9:16",
    aspect: [9, 16],
  },
  {
    key: "idleVideoHorizontal",
    title: "Idle video · Horizontal",
    sub: "Plays after the landscape idle images, muted and looping.",
    ratioLabel: "16:9",
    aspect: [16, 9],
  },
];

const VIDEO_PREVIEW_H = 110;
const videoPreviewWidth = (aspect: [number, number]) =>
  Math.max(48, Math.round((VIDEO_PREVIEW_H * aspect[0]) / aspect[1]));

/**
 * Muted, looping preview of a slot's video — a faithful `contentFit="cover"`
 * center-crop of what the kiosk renders. Keyed by uri at the call site so a new
 * player is created when the source swaps (local pick -> uploaded CDN url).
 */
function VideoSlotPreview({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    // loop=true for a continuous settings preview, unlike KioskMediaCarousel
    // which uses loop=false to advance to the next idle slide on playToEnd.
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="cover"
      nativeControls={false}
    />
  );
}

const GROUPS: {
  key: GroupKey;
  title: string;
  sub: string;
  ratioLabel: string;
  aspect: [number, number];
}[] = [
  {
    key: "idleImagesVertical",
    title: "Idle · Vertical",
    sub: "Full-bleed portrait idle screen.",
    ratioLabel: "9:16",
    aspect: [9, 16],
  },
  {
    key: "idleImagesHorizontal",
    title: "Idle · Horizontal",
    sub: "Full-bleed landscape idle screen.",
    ratioLabel: "16:9",
    aspect: [16, 9],
  },
  {
    key: "orderBannerImagesVertical",
    title: "In-order banner · Vertical",
    sub: "Wide banner above the menu grid.",
    ratioLabel: "21:9",
    aspect: [21, 9],
  },
  {
    key: "orderBannerImagesHorizontal",
    title: "In-order banner · Horizontal",
    sub: "Tall sidebar next to the menu grid.",
    ratioLabel: "3:4",
    aspect: [3, 4],
  },
];

const THUMB_H = 64;
const thumbWidth = (aspect: [number, number]) =>
  Math.max(40, Math.min(150, Math.round((THUMB_H * aspect[0]) / aspect[1])));

/**
 * On-device kiosk asset management — mirrors the website's kiosk-profile Assets
 * panel. Manages the logo, the placement-scoped idle-screen and in-order banner
 * image sets (vertical + horizontal), and the single idle video per orientation.
 * Media is picked from the device, pushed to the CDN via the shared `cdn-upload`
 * edge function, and its URL written straight into the `kiosk_profiles` columns
 * (array columns for images, text columns for the idle videos).
 */
export function KioskAssetsManager({
  config,
  onRefreshKioskConfig,
}: {
  config: KioskConfig;
  onRefreshKioskConfig?: () => void | Promise<unknown>;
}) {
  const supabase = useSupabaseClient();
  const { getToken } = useAuth();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  const [logo, setLogo] = useState<string | null>(config.logoUrl);
  const [groups, setGroups] = useState<Record<GroupKey, string[]>>({
    idleImagesVertical: config.idleImagesVertical,
    idleImagesHorizontal: config.idleImagesHorizontal,
    orderBannerImagesVertical: config.orderBannerImagesVertical,
    orderBannerImagesHorizontal: config.orderBannerImagesHorizontal,
  });
  const [videos, setVideos] = useState<Record<VideoKey, string | null>>({
    idleVideoVertical: config.idleVideoVertical,
    idleVideoHorizontal: config.idleVideoHorizontal,
  });
  // Which slot is mid-upload, e.g. "logo", a GroupKey, or a VideoKey — drives spinners.
  const [busy, setBusy] = useState<string | null>(null);

  // Re-sync from a background config refresh, but never mid-upload.
  useEffect(() => {
    if (busy) return;
    setLogo(config.logoUrl);
    setGroups({
      idleImagesVertical: config.idleImagesVertical,
      idleImagesHorizontal: config.idleImagesHorizontal,
      orderBannerImagesVertical: config.orderBannerImagesVertical,
      orderBannerImagesHorizontal: config.orderBannerImagesHorizontal,
    });
    setVideos({
      idleVideoVertical: config.idleVideoVertical,
      idleVideoHorizontal: config.idleVideoHorizontal,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  const pickImage = async (
    aspect?: [number, number],
  ): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo access to add kiosk images.",
      );
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect,
      quality: 0.8,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return null;
    return result.assets[0].base64;
  };

  // Single entry point to the shared cdn-upload edge function. All kiosk media
  // (logo, images, videos) lives under the "kiosk" category — matching the web
  // dashboard — so callers vary only the file name and content type.
  const invokeCdnUpload = async (
    fileBase64: string,
    fileName: string,
    contentType: string,
  ): Promise<string> => {
    if (!selectedStore) throw new Error("No store selected.");
    const token = await getToken();
    const { data, error } = await supabase.functions.invoke("cdn-upload", {
      body: {
        scope: "merchant",
        merchantId: selectedStore.merchant_id,
        category: "kiosk",
        fileName,
        fileBase64,
        contentType,
      },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error || !data?.cdnUrl)
      throw error ?? new Error("Upload returned no URL.");
    return data.cdnUrl as string;
  };

  const uploadToCdn = (base64: string, label: string): Promise<string> =>
    invokeCdnUpload(base64, `kiosk_${label}_${Date.now()}.jpg`, "image/jpeg");

  const persist = async (column: string, value: unknown) => {
    const { error } = await supabase
      .from("kiosk_profiles")
      .update({ [column]: value })
      .eq("id", config.id);
    if (error) throw error;
  };

  // ── Logo ──
  const replaceLogo = async () => {
    if (busy) return;
    const b64 = await pickImage();
    if (!b64) return;
    setBusy("logo");
    try {
      const url = await uploadToCdn(b64, "logo");
      await persist(COLUMN.logoUrl, url);
      setLogo(url);
      onRefreshKioskConfig?.();
      toastService.show({
        title: "Logo updated",
        message: "The kiosk logo has been replaced.",
        type: "success",
      });
    } catch (err) {
      toastService.show({
        title: "Upload failed",
        message: err instanceof Error ? err.message : "Could not upload logo.",
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeLogo = async () => {
    setLogo(null);
    try {
      await persist(COLUMN.logoUrl, null);
      onRefreshKioskConfig?.();
    } catch {
      toastService.show({
        title: "Couldn't remove logo",
        message: "Please try again.",
        type: "error",
      });
    }
  };

  // ── Image groups ──
  const addToGroup = async (key: GroupKey, aspect: [number, number]) => {
    if (busy) return;
    if (groups[key].length >= MAX_PER_GROUP) {
      toastService.show({
        title: "Limit reached",
        message: `Up to ${MAX_PER_GROUP} images per slot.`,
        type: "warning",
      });
      return;
    }
    const b64 = await pickImage(aspect);
    if (!b64) return;
    setBusy(key);
    try {
      const url = await uploadToCdn(b64, key);
      const next = [...groups[key], url];
      await persist(COLUMN[key], next);
      setGroups((g) => ({ ...g, [key]: next }));
      onRefreshKioskConfig?.();
      toastService.show({
        title: "Image added",
        message: "Saved to this kiosk profile.",
        type: "success",
      });
    } catch (err) {
      toastService.show({
        title: "Upload failed",
        message: err instanceof Error ? err.message : "Could not upload image.",
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeFromGroup = async (key: GroupKey, index: number) => {
    const next = groups[key].filter((_, i) => i !== index);
    setGroups((g) => ({ ...g, [key]: next })); // optimistic
    try {
      await persist(COLUMN[key], next);
      onRefreshKioskConfig?.();
    } catch {
      toastService.show({
        title: "Couldn't remove image",
        message: "Please try again.",
        type: "error",
      });
    }
  };

  // ── Idle videos ──
  const pickVideo = async (): Promise<string | null> => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo access to add kiosk videos.");
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Videos,
      allowsEditing: false,
      quality: 1,
    });
    if (result.canceled || !result.assets[0]?.uri) return null;
    const asset = result.assets[0];
    // The CDN only accepts MP4; reject other containers before reading bytes.
    if (asset.mimeType && asset.mimeType !== "video/mp4") {
      toastService.show({
        title: "Use an MP4 video",
        message: "Only MP4 (H.264) videos are supported.",
        type: "warning",
      });
      return null;
    }
    // Cap size before base64-reading the file so we never materialize a huge
    // string on the tablet. Fall back to a filesystem stat if the asset omits it.
    let size = asset.fileSize ?? 0;
    if (!size) {
      const info = await FileSystem.getInfoAsync(asset.uri);
      size = info.exists ? (info.size ?? 0) : 0;
    }
    if (size > MAX_VIDEO_BYTES) {
      toastService.show({
        title: "Video too large",
        message: "Choose an MP4 up to 20MB.",
        type: "warning",
      });
      return null;
    }
    return asset.uri;
  };

  // Videos stream straight to the edge function as raw bytes (no base64), so the
  // tablet never materializes a ~27MB string and the worker never holds several
  // copies at once — the base64-in-JSON path exceeded the edge function's memory
  // limit on real-world clips.
  const uploadVideoToCdn = async (
    uri: string,
    label: string,
  ): Promise<string> => {
    if (!selectedStore) throw new Error("No store selected.");
    if (!SUPABASE_URL) throw new Error("Supabase URL is not configured.");
    const token = await getToken();
    const result = await FileSystem.uploadAsync(
      `${SUPABASE_URL}/functions/v1/cdn-upload`,
      uri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          apikey: SUPABASE_ANON_KEY ?? "",
          Authorization: `Bearer ${token}`,
          "x-cdn-scope": "merchant",
          "x-cdn-merchant-id": selectedStore.merchant_id,
          "x-cdn-category": "kiosk",
          "x-cdn-file-name": `kiosk_${label}_${Date.now()}.mp4`,
          "x-cdn-content-type": "video/mp4",
        },
      },
    );
    if (result.status < 200 || result.status >= 300) {
      let message = "Upload failed";
      try {
        message = JSON.parse(result.body)?.error ?? message;
      } catch {
        // Non-JSON error body — keep the default message.
      }
      throw new Error(message);
    }
    const data = JSON.parse(result.body);
    if (!data?.cdnUrl) throw new Error("Upload returned no URL.");
    return data.cdnUrl as string;
  };

  const replaceVideo = async (key: VideoKey) => {
    if (busy) return;
    const uri = await pickVideo();
    if (!uri) return;
    setBusy(key);
    try {
      const url = await uploadVideoToCdn(uri, key);
      await persist(COLUMN[key], url);
      setVideos((v) => ({ ...v, [key]: url }));
      onRefreshKioskConfig?.();
      toastService.show({
        title: "Video updated",
        message: "Saved to this kiosk profile.",
        type: "success",
      });
    } catch (err) {
      toastService.show({
        title: "Upload failed",
        message: err instanceof Error ? err.message : "Could not upload video.",
        type: "error",
      });
    } finally {
      setBusy(null);
    }
  };

  const removeVideo = async (key: VideoKey) => {
    setVideos((v) => ({ ...v, [key]: null })); // optimistic
    try {
      await persist(COLUMN[key], null);
      onRefreshKioskConfig?.();
    } catch {
      toastService.show({
        title: "Couldn't remove video",
        message: "Please try again.",
        type: "error",
      });
    }
  };

  return (
    <View style={{ gap: 18 }}>
      {/* Logo */}
      <View>
        <Text className="text-xs font-semibold text-gray-500 mb-0.5">Logo</Text>
        <Text className="text-[11px] text-gray-400 mb-2.5">
          Shown in the kiosk header and as the idle-screen fallback.
        </Text>
        <View className="flex-row items-center gap-3">
          <View
            className="rounded-xl bg-gray-100 border border-gray-200 items-center justify-center overflow-hidden"
            style={{ width: 64, height: 64 }}
          >
            {logo ? (
              <Image
                source={{ uri: logo }}
                style={{ width: "100%", height: "100%" }}
                resizeMode="contain"
              />
            ) : (
              <ImagePlus size={22} color="#9CA3AF" />
            )}
          </View>
          <TouchableOpacity
            onPress={replaceLogo}
            disabled={busy === "logo"}
            activeOpacity={0.85}
            className="flex-row items-center px-3.5 py-2.5 rounded-xl border border-teal-300 bg-teal-50"
          >
            {busy === "logo" ? (
              <ActivityIndicator size="small" color={TEAL} />
            ) : (
              <RefreshCw size={15} color={TEAL} />
            )}
            <Text className="text-sm font-bold text-teal-700 ml-1.5">
              {logo ? "Replace" : "Add logo"}
            </Text>
          </TouchableOpacity>
          {logo ? (
            <TouchableOpacity
              onPress={removeLogo}
              activeOpacity={0.85}
              className="w-10 h-10 rounded-xl border border-gray-200 bg-white items-center justify-center"
            >
              <Trash2 size={16} color="#DC2626" />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Image groups */}
      {GROUPS.map((g) => {
        const images = groups[g.key];
        const atMax = images.length >= MAX_PER_GROUP;
        const w = thumbWidth(g.aspect);
        const uploading = busy === g.key;
        return (
          <View key={g.key}>
            <View className="flex-row items-center gap-2 mb-0.5">
              <Text className="text-xs font-semibold text-gray-500">
                {g.title}
              </Text>
              <View className="px-1.5 py-0.5 rounded bg-gray-100">
                <Text className="text-[10px] font-bold text-gray-500">
                  {g.ratioLabel}
                </Text>
              </View>
              <Text className="text-[10px] text-gray-400">
                {images.length}/{MAX_PER_GROUP}
              </Text>
            </View>
            <Text className="text-[11px] text-gray-400 mb-2">{g.sub}</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingRight: 4 }}
            >
              {images.map((uri, i) => (
                <View key={`${uri}-${i}`} style={{ width: w }}>
                  <View
                    className="rounded-lg overflow-hidden border border-gray-200 bg-gray-100"
                    style={{ width: w, height: THUMB_H }}
                  >
                    <Image
                      source={{ uri }}
                      style={{ width: "100%", height: "100%" }}
                      resizeMode="cover"
                    />
                  </View>
                  <Pressable
                    onPress={() => removeFromGroup(g.key, i)}
                    hitSlop={8}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 items-center justify-center"
                    style={{
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 2,
                      elevation: 2,
                    }}
                  >
                    <X size={13} color="#FFFFFF" strokeWidth={3} />
                  </Pressable>
                </View>
              ))}

              {!atMax ? (
                <TouchableOpacity
                  onPress={() => addToGroup(g.key, g.aspect)}
                  disabled={uploading}
                  activeOpacity={0.7}
                  className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 items-center justify-center"
                  style={{ width: w, height: THUMB_H }}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={TEAL} />
                  ) : (
                    <Plus size={20} color="#9CA3AF" />
                  )}
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>
        );
      })}

      {/* Idle videos (one per orientation) */}
      {VIDEO_SLOTS.map((slot) => {
        const uri = videos[slot.key];
        const uploading = busy === slot.key;
        const w = videoPreviewWidth(slot.aspect);
        return (
          <View key={slot.key}>
            <View className="flex-row items-center gap-2 mb-0.5">
              <Text className="text-xs font-semibold text-gray-500">
                {slot.title}
              </Text>
              <View className="px-1.5 py-0.5 rounded bg-gray-100">
                <Text className="text-[10px] font-bold text-gray-500">
                  {slot.ratioLabel}
                </Text>
              </View>
            </View>
            <Text className="text-[11px] text-gray-400 mb-2">{slot.sub}</Text>

            <View className="flex-row items-center gap-3">
              <View
                className="rounded-lg overflow-hidden border border-gray-200 bg-black items-center justify-center"
                style={{ width: w, height: VIDEO_PREVIEW_H }}
              >
                {uri ? (
                  <VideoSlotPreview
                    key={uri}
                    uri={uri}
                    width={w}
                    height={VIDEO_PREVIEW_H}
                  />
                ) : (
                  <Film size={20} color="#9CA3AF" />
                )}
              </View>
              <TouchableOpacity
                onPress={() => replaceVideo(slot.key)}
                disabled={uploading}
                activeOpacity={0.85}
                className="flex-row items-center px-3.5 py-2.5 rounded-xl border border-teal-300 bg-teal-50"
              >
                {uploading ? (
                  <ActivityIndicator size="small" color={TEAL} />
                ) : (
                  <RefreshCw size={15} color={TEAL} />
                )}
                <Text className="text-sm font-bold text-teal-700 ml-1.5">
                  {uri ? "Replace" : "Add video"}
                </Text>
              </TouchableOpacity>
              {uri ? (
                <TouchableOpacity
                  onPress={() => removeVideo(slot.key)}
                  activeOpacity={0.85}
                  className="w-10 h-10 rounded-xl border border-gray-200 bg-white items-center justify-center"
                >
                  <Trash2 size={16} color="#DC2626" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        );
      })}

      <Text className="text-[11px] text-gray-400">
        Idle videos are MP4, up to 20MB, and loop after the idle images. Longer or
        higher-resolution media is best managed on the web dashboard.
      </Text>
    </View>
  );
}
