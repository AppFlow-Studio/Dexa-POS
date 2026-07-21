ALTER TABLE public.cash_drawer_operations
  ADD COLUMN vendor_id uuid NULL REFERENCES public.vendors(id) ON DELETE SET NULL;

CREATE INDEX idx_cash_drawer_operations_vendor_id
  ON public.cash_drawer_operations(vendor_id)
  WHERE vendor_id IS NOT NULL;
