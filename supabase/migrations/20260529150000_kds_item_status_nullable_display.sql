-- Allow kds_item_status.kds_display_id to be NULL so acknowledgements can be
-- persisted for KDS stations that have no kds_displays row configured.
-- Without this, the acknowledge_kds_notice RPC silently inserts 0 rows for
-- stations without a display, leaving acknowledgements client-side only.

ALTER TABLE public.kds_item_status
  ALTER COLUMN kds_display_id DROP NOT NULL;

-- Replace the unique index with two partial indexes that handle NULLs correctly.
-- Postgres allows multiple NULL values in a standard unique index (NULL != NULL),
-- so a partial index scoped to NULL rows enforces the correct constraint.
DROP INDEX IF EXISTS public.uq_kds_item_status_display_item;

CREATE UNIQUE INDEX uq_kds_item_status_display_item
  ON public.kds_item_status (kds_display_id, order_item_id)
  WHERE kds_display_id IS NOT NULL;

CREATE UNIQUE INDEX uq_kds_item_status_no_display_item
  ON public.kds_item_status (order_item_id)
  WHERE kds_display_id IS NULL;
