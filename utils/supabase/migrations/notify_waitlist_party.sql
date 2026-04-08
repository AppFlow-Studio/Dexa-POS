-- First-notify RPC for waitlist guests (status='waiting' only)
-- Sends notification data back to client; SMS is sent via the notify-waitlist-guest edge function.
CREATE OR REPLACE FUNCTION notify_waitlist_party(
  p_waitlist_id        UUID,
  p_notification_type  TEXT DEFAULT 'sms'
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry    waitlist%ROWTYPE;
  v_location locations%ROWTYPE;
BEGIN
  SELECT * INTO v_entry FROM waitlist
  WHERE id = p_waitlist_id
    AND merchant_id = user_merchant_id()
    AND location_id = ANY(user_location_ids())
    AND status = 'waiting';

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Entry not found or not in waiting status');
  END IF;

  IF v_entry.notification_count >= 3 THEN
    RETURN json_build_object('success', false, 'error', 'max_notifications_reached');
  END IF;

  SELECT * INTO v_location FROM locations WHERE id = v_entry.location_id;

  RETURN json_build_object(
    'success', true,
    'phone', v_entry.phone,
    'party_name', v_entry.party_name,
    'store_name', COALESCE(v_location.name, 'Our Restaurant'),
    'notified_at', v_entry.notified_at,
    'notification_count', v_entry.notification_count,
    'last_notification_type', v_entry.last_notification_type,
    'notification_failures', v_entry.notification_failures,
    'action_required', 'send_sms',
    'message_template', 'Hi ' || v_entry.party_name || '! Your table at ' || COALESCE(v_location.name, 'Our Restaurant') || ' is ready. Please check in with the host within 10 minutes.'
  );
END;
$$;
