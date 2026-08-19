-- Replaces the flat hero_image_url / attract_video_url / attract_image_urls
-- columns with placement- and orientation-scoped media slots. Today those
-- three columns were reused identically for both the idle/attract screen and
-- the in-order menu banner (Template B/C), across both orientations, so a
-- single upload had to work as a full-bleed portrait idle screen, a full-bleed
-- landscape idle screen, a small rounded order-screen banner card, etc. all at
-- once. Splitting into explicit slots lets the dashboard ask for the right
-- aspect ratio per placement and the app render the correct asset per screen.
--
-- Video stays idle-only (never used for the order-screen banner).
-- logo_url is untouched — single slot, not part of this split.

alter table public.kiosk_profiles
  add column if not exists idle_images_vertical jsonb not null default '[]'::jsonb,
  add column if not exists idle_images_horizontal jsonb not null default '[]'::jsonb,
  add column if not exists idle_video_vertical text,
  add column if not exists idle_video_horizontal text,
  add column if not exists order_banner_images_vertical jsonb not null default '[]'::jsonb,
  add column if not exists order_banner_images_horizontal jsonb not null default '[]'::jsonb;

alter table public.kiosk_profiles
  add constraint kiosk_profiles_idle_images_vertical_max
    check (jsonb_array_length(idle_images_vertical) <= 5),
  add constraint kiosk_profiles_idle_images_horizontal_max
    check (jsonb_array_length(idle_images_horizontal) <= 5),
  add constraint kiosk_profiles_order_banner_images_vertical_max
    check (jsonb_array_length(order_banner_images_vertical) <= 5),
  add constraint kiosk_profiles_order_banner_images_horizontal_max
    check (jsonb_array_length(order_banner_images_horizontal) <= 5);

-- Backfill: old assets had no orientation tag, so seed both orientations with
-- what's there today. hero_image_url is folded in as a trailing fallback
-- entry in the idle image arrays (its old role), only when the array has
-- room left under the 5-image cap.
update public.kiosk_profiles
set
  idle_images_vertical = case
    when hero_image_url is not null
      and jsonb_array_length(attract_image_urls) < 5
      and not (attract_image_urls @> to_jsonb(array[hero_image_url]))
    then attract_image_urls || to_jsonb(array[hero_image_url])
    else attract_image_urls
  end,
  idle_images_horizontal = case
    when hero_image_url is not null
      and jsonb_array_length(attract_image_urls) < 5
      and not (attract_image_urls @> to_jsonb(array[hero_image_url]))
    then attract_image_urls || to_jsonb(array[hero_image_url])
    else attract_image_urls
  end,
  idle_video_vertical = attract_video_url,
  idle_video_horizontal = attract_video_url,
  order_banner_images_vertical = attract_image_urls,
  order_banner_images_horizontal = attract_image_urls;

alter table public.kiosk_profiles
  drop column if exists hero_image_url,
  drop column if exists attract_video_url,
  drop column if exists attract_image_urls;
