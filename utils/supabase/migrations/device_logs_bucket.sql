-- Create private storage bucket for device logs
INSERT INTO storage.buckets (id, name, public)
VALUES ('device-logs', 'device-logs', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Authenticated users can upload logs
CREATE POLICY "Authenticated users can upload device logs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'device-logs');

-- RLS: Authenticated users can read device logs
CREATE POLICY "Authenticated users can read device logs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'device-logs');
