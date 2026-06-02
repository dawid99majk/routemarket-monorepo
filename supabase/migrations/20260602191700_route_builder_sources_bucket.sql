-- Migration: Create route_builder_sources bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'route_builder_sources',
    'route_builder_sources',
    false, -- Private bucket, only owner and service role can access
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Policies for route_builder_sources
CREATE POLICY "Users can upload their own sources"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'route_builder_sources' AND auth.uid() = owner);

CREATE POLICY "Users can view their own sources"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'route_builder_sources' AND auth.uid() = owner);

CREATE POLICY "Users can update their own sources"
    ON storage.objects FOR UPDATE
    USING (bucket_id = 'route_builder_sources' AND auth.uid() = owner);

CREATE POLICY "Users can delete their own sources"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'route_builder_sources' AND auth.uid() = owner);

-- Service role has full access (implicit, but can be explicit if needed)
CREATE POLICY "Service role full access"
    ON storage.objects FOR ALL
    USING (bucket_id = 'route_builder_sources' AND auth.jwt() ->> 'role' = 'service_role');

-- Create a cron job to delete files older than 7 days from route_builder_sources
-- Requires pg_cron extension, assuming it's enabled in Supabase
SELECT cron.schedule(
  'cleanup_route_builder_sources',
  '0 2 * * *', -- Run every day at 2:00 AM
  $$
  DELETE FROM storage.objects
  WHERE bucket_id = 'route_builder_sources'
  AND created_at < NOW() - INTERVAL '7 days';
  $$
);
