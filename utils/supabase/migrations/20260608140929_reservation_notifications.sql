-- Reservation notification tracking + RPC for recording SMS send results.
-- Mirrors the waitlist_notification_failures.sql shape so the
-- notify-reservation-guest edge function can record outcomes the same way
-- notify-waitlist-guest does.

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS notification_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_failures INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_notification_template TEXT;

-- RPC called by edge function to record SMS send result
CREATE OR REPLACE FUNCTION record_reservation_sms_result(
  p_reservation_id UUID,
  p_success        BOOLEAN,
  p_template_key   TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_success THEN
    UPDATE reservations
    SET
      notification_count = notification_count + 1,
      last_notification_at = NOW(),
      last_notification_template = p_template_key
    WHERE id = p_reservation_id;
  ELSE
    UPDATE reservations
    SET
      notification_count = notification_count + 1,
      notification_failures = notification_failures + 1,
      last_notification_template = p_template_key
    WHERE id = p_reservation_id;
  END IF;
END;
$$;
