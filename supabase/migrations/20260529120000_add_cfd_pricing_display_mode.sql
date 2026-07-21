/* Add CFD pricing display mode column to locations with constraint */
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'locations' AND column_name = 'cfd_pricing_display_mode'
  ) THEN
    ALTER TABLE public.locations
      ADD COLUMN cfd_pricing_display_mode text NOT NULL DEFAULT 'dual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_cfd_pricing_display_mode'
  ) THEN
    ALTER TABLE public.locations
      ADD CONSTRAINT chk_cfd_pricing_display_mode CHECK (cfd_pricing_display_mode IN ('dual','card_only','cash_only'));
  END IF;
END$$;

COMMENT ON COLUMN public.locations.cfd_pricing_display_mode IS 'Controls CFD price display: dual|card_only|cash_only';
