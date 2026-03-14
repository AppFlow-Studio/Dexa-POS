-- ============================================================
-- Migration: Castles Payment Terminal Support
-- File: utils/supabase/migrations/castles_payment_support.sql
-- ============================================================
-- 1. Adds 'castles' to terminal_type enum
-- 2. process_payment_v7.sql was updated in-place with:
--    - Section 6.7: Castles terminal response extraction
--    - Section 7: terminal_type CASE for 'castles'
--    - Section 7: card_type COALESCE with castles_transaction
--    - Section 7: rrn, result_code, result_message columns added to INSERT
--    - log_payment_event: Castles terminalId + statusMessage fallbacks
--    Re-apply process_payment_v7.sql after running this migration.
-- ============================================================

-- Add 'castles' to terminal_type enum
ALTER TYPE terminal_type ADD VALUE IF NOT EXISTS 'castles';
