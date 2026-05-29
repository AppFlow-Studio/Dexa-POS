-- Add acknowledgement tracking columns to kds_item_status.
-- The acknowledge_kds_notice RPC and updated get_kds_tickets_v2 are defined
-- in later migrations (20260529130000, 20260529140000).

ALTER TABLE public.kds_item_status
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid REFERENCES public.staff_profiles(id);
