create table if not exists public.kiosk_profiles (
  id                          uuid primary key default gen_random_uuid(),
  merchant_id                 uuid not null references public.merchants(id) on delete cascade,
  location_id                 uuid not null references public.locations(id) on delete cascade,
  profile_name                text not null default 'Default Kiosk',

  template_id                 text not null default 'template_a',
  primary_color               text not null default '#0C4FD1',
  secondary_color             text,
  accent_color                text,
  background_color            text not null default '#FFFFFF',
  text_color                  text not null default '#0A0A0A',
  header_text_color           text,
  font_family                 text default 'Inter',

  logo_url                    text,
  hero_image_url              text,
  attract_video_url           text,
  attract_image_urls          jsonb not null default '[]'::jsonb,

  orientation                 text not null default 'vertical',
  idle_timeout_seconds        int  not null default 60,
  cart_reset_timeout_seconds  int  not null default 30,
  welcome_message             text default 'Tap to order',
  pickup_number_prefix        text default '',
  auto_print_receipt          boolean not null default false,
  receipt_email_prompt        boolean not null default true,
  receipt_sms_prompt          boolean not null default true,
  show_calorie_info           boolean not null default false,
  show_allergens              boolean not null default true,
  loyalty_enrollment_enabled  boolean not null default true,
  tip_screen_enabled          boolean not null default true,
  tip_presets                 jsonb not null default '[15, 18, 20, 25]'::jsonb,

  is_active                   boolean not null default false,
  payment_terminal_id         uuid references public.payment_terminals(id) on delete set null,
  admin_pin_hash              text,

  published_at                timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),

  constraint kiosk_profiles_template_check
    check (template_id in ('template_a','template_b','template_c')),
  constraint kiosk_profiles_orientation_check
    check (orientation in ('vertical','horizontal')),
  constraint kiosk_profiles_idle_timeout_check
    check (idle_timeout_seconds between 15 and 600),
  constraint kiosk_profiles_cart_reset_check
    check (cart_reset_timeout_seconds between 10 and 300),
  constraint kiosk_profiles_unique_name_per_location
    unique (merchant_id, location_id, profile_name)
);

create index if not exists kiosk_profiles_merchant_idx
  on public.kiosk_profiles(merchant_id);
create index if not exists kiosk_profiles_location_idx
  on public.kiosk_profiles(location_id);

create or replace function public.kiosk_profiles_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists kiosk_profiles_set_updated_at on public.kiosk_profiles;
create trigger kiosk_profiles_set_updated_at
  before update on public.kiosk_profiles
  for each row execute function public.kiosk_profiles_touch_updated_at();

alter table public.stations
  add column if not exists kiosk_profile_id uuid references public.kiosk_profiles(id) on delete set null;
create index if not exists stations_kiosk_profile_idx on public.stations(kiosk_profile_id);

create table if not exists public.kiosk_pickup_sequences (
  location_id    uuid not null references public.locations(id) on delete cascade,
  business_date  date not null,
  current_value  int  not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (location_id, business_date)
);

alter type public.online_order_provider add value if not exists 'kiosk';

alter table public.kiosk_profiles enable row level security;

drop policy if exists kiosk_profiles_merchant_all on public.kiosk_profiles;
create policy kiosk_profiles_merchant_all
  on public.kiosk_profiles for all
  to authenticated
  using (
    merchant_id in (
      select merchant_id
      from public.staff_profiles
      where user_id = public.current_user_id()
    )
  )
  with check (
    merchant_id in (
      select merchant_id
      from public.staff_profiles
      where user_id = public.current_user_id()
    )
  );

drop policy if exists kiosk_profiles_carrier_read on public.kiosk_profiles;
create policy kiosk_profiles_carrier_read
  on public.kiosk_profiles for select
  to authenticated
  using (
    exists (
      select 1
      from public.merchants m
      where m.id = kiosk_profiles.merchant_id
        and m.carrier_id = public.get_my_carrier_id()
    )
  );

drop policy if exists kiosk_profiles_hq_all on public.kiosk_profiles;

create policy kiosk_profiles_hq_all
  on public.kiosk_profiles for all
  to authenticated
  using (exists (select 1 from public.get_my_hq_role()))
  with check (exists (select 1 from public.get_my_hq_role()));

comment on column public.stations.station_type is
  'Station surface selector. Current string conventions include pos/register, kds, cfd, kiosk, terminal, and mobile.';
