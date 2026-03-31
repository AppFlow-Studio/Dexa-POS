create table if not exists public.cfd_ordering_panel_images (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  panel_slot text not null check (panel_slot in ('primary', 'secondary')),
  image_url text not null,
  is_active boolean default true,
  display_order integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_cfd_ordering_panel_images_location_slot
  on public.cfd_ordering_panel_images(location_id, panel_slot, display_order);

create unique index if not exists idx_cfd_ordering_panel_images_location_slot_order
  on public.cfd_ordering_panel_images(location_id, panel_slot, display_order);

create or replace function public.set_cfd_ordering_panel_images_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_cfd_ordering_panel_images_updated_at
on public.cfd_ordering_panel_images;

create trigger trg_cfd_ordering_panel_images_updated_at
before update on public.cfd_ordering_panel_images
for each row
execute function public.set_cfd_ordering_panel_images_updated_at();

alter table public.cfd_ordering_panel_images enable row level security;

drop policy if exists "Allow authenticated users to read CFD ordering panel images"
on public.cfd_ordering_panel_images;
create policy "Allow authenticated users to read CFD ordering panel images"
on public.cfd_ordering_panel_images
for select
to authenticated
using (true);

drop policy if exists "Allow authenticated users to insert CFD ordering panel images"
on public.cfd_ordering_panel_images;
create policy "Allow authenticated users to insert CFD ordering panel images"
on public.cfd_ordering_panel_images
for insert
to authenticated
with check (true);

drop policy if exists "Allow authenticated users to update CFD ordering panel images"
on public.cfd_ordering_panel_images;
create policy "Allow authenticated users to update CFD ordering panel images"
on public.cfd_ordering_panel_images
for update
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to delete CFD ordering panel images"
on public.cfd_ordering_panel_images;
create policy "Allow authenticated users to delete CFD ordering panel images"
on public.cfd_ordering_panel_images
for delete
to authenticated
using (true);
