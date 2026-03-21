-- Create enum type for split payment paths
DO $$ BEGIN
  CREATE TYPE split_payment_path_enum AS ENUM (
    'split-by-item',
    'split-evenly',
    'split-custom-amount',
    'pay-for-items'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS split_payment_path split_payment_path_enum DEFAULT NULL;

COMMENT ON COLUMN orders.split_payment_path IS
  'Locks split method after first partial split payment';
