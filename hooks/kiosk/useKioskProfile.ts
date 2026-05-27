import { queryClient } from "@/contexts/TanstackProvider";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { storage } from "@/lib/storage";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export interface KioskProfile {
  id: string;
  merchant_id: string;
  location_id: string;
  profile_name: string;
  template_id: "template_a" | "template_b" | "template_c";
  primary_color: string;
  secondary_color: string | null;
  accent_color: string | null;
  background_color: string;
  text_color: string;
  header_text_color: string | null;
  font_family: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  attract_video_url: string | null;
  attract_image_urls: unknown[];
  orientation: "vertical" | "horizontal";
  idle_timeout_seconds: number;
  cart_reset_timeout_seconds: number;
  welcome_message: string | null;
  pickup_number_prefix: string | null;
  auto_print_receipt: boolean;
  receipt_email_prompt: boolean;
  receipt_sms_prompt: boolean;
  show_calorie_info: boolean;
  show_allergens: boolean;
  loyalty_enrollment_enabled: boolean;
  tip_screen_enabled: boolean;
  tip_presets: number[];
  is_active: boolean;
  payment_terminal_id: string | null;
  admin_pin_hash: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KioskStationProfile {
  station: {
    id: string;
    station_name: string;
    station_type: string;
    station_number: number | null;
    kiosk_profile_id: string | null;
  };
  profile: KioskProfile | null;
}

const cacheKey = (stationId: string) => `kiosk-profile:${stationId}`;

function readCachedProfile(stationId: string): KioskStationProfile | undefined {
  const cached = storage.getString(cacheKey(stationId));
  if (!cached) return undefined;
  try {
    return JSON.parse(cached) as KioskStationProfile;
  } catch {
    return undefined;
  }
}

function persistCachedProfile(
  stationId: string,
  value: KioskStationProfile,
): void {
  storage.set(cacheKey(stationId), JSON.stringify(value));
}

export function useKioskProfile(stationId: string | null | undefined) {
  const supabase = useSupabaseClient();
  const client = useQueryClient();

  const query = useQuery<KioskStationProfile>({
    queryKey: ["kiosk-profile", stationId],
    enabled: Boolean(stationId),
    networkMode: "offlineFirst",
    initialData: stationId ? readCachedProfile(stationId) : undefined,
    queryFn: async () => {
      if (!stationId) {
        throw new Error("Station id is required to load a kiosk profile");
      }

      const { data: station, error: stationError } = await supabase
        .from("stations")
        .select(
          "id, station_name, station_type, station_number, kiosk_profile_id",
        )
        .eq("id", stationId)
        .single();

      if (stationError) throw stationError;

      const stationProfile = station as KioskStationProfile["station"];
      if (!stationProfile.kiosk_profile_id) {
        return { station: stationProfile, profile: null };
      }

      const { data: profile, error: profileError } = await supabase
        .from("kiosk_profiles")
        .select("*")
        .eq("id", stationProfile.kiosk_profile_id)
        .single();

      if (profileError) throw profileError;

      return {
        station: stationProfile,
        profile: profile as KioskProfile,
      };
    },
  });

  useEffect(() => {
    if (stationId && query.data) {
      persistCachedProfile(stationId, query.data);
    }
  }, [query.data, stationId]);

  useEffect(() => {
    const profileId = query.data?.profile?.id;
    if (!stationId || !profileId) return;

    const channel = supabase
      .channel(`kiosk-profile:${profileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kiosk_profiles",
          filter: `id=eq.${profileId}`,
        },
        () => {
          void client.invalidateQueries({
            queryKey: ["kiosk-profile", stationId],
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client, query.data?.profile?.id, stationId, supabase]);

  return query;
}

export function prefillKioskProfileCache(
  stationId: string,
  value: KioskStationProfile,
): void {
  persistCachedProfile(stationId, value);
  queryClient.setQueryData(["kiosk-profile", stationId], value);
}
