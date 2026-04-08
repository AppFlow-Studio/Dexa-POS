-- ============================================================================
-- Migration: add_sent_to_kitchen_status.sql
-- Adds 'sent_to_kitchen' value to order_status enum
-- New state machine: draft → pending → sent_to_kitchen → preparing → ready → completed
-- ============================================================================

-- Add the new enum value before 'preparing'
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'sent_to_kitchen' BEFORE 'preparing';
