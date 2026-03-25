-- ============================================================
-- Migration: Update payment_terminals connection_type constraint
-- ============================================================
-- The original constraint only allowed ('cloud', 'local') for Dejavoo terminals.
-- Castles terminals need 'usb' for USB connections and 'local' for TCP socket.
-- This adds 'usb' to the allowed values.
-- ============================================================

ALTER TABLE payment_terminals
  DROP CONSTRAINT IF EXISTS chk_connection_type;

ALTER TABLE payment_terminals
  ADD CONSTRAINT chk_connection_type
  CHECK (connection_type IN ('cloud', 'local', 'usb'));
