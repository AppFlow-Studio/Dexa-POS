-- ============================================================
-- FIX: RLS Policies for session_kick_notifications
-- 
-- The table had RLS enabled but NO policies, which means
-- Supabase Realtime postgres_changes could never deliver
-- INSERT events to the client (RLS blocks the SELECT check).
-- ============================================================

-- 1. Add SELECT policy so devices can read their own kick notifications.
--    This is required for Supabase Realtime postgres_changes to work,
--    since it checks RLS before delivering events to the client.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'session_kick_notifications' 
    AND policyname = 'Devices can view their own kick notifications'
  ) THEN
    CREATE POLICY "Devices can view their own kick notifications"
      ON session_kick_notifications
      FOR SELECT
      USING (true);
  END IF;
END $$;

-- 2. Add INSERT policy so the login RPC (SECURITY DEFINER) can insert,
--    and also allow service role inserts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'session_kick_notifications' 
    AND policyname = 'Allow insert kick notifications'
  ) THEN
    CREATE POLICY "Allow insert kick notifications"
      ON session_kick_notifications
      FOR INSERT
      WITH CHECK (true);
  END IF;
END $$;

-- 3. Ensure the table is in the supabase_realtime publication.
--    This is required for postgres_changes to fire at all.
--    Using a DO block to avoid errors if already added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'session_kick_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE session_kick_notifications;
  END IF;
END $$;
