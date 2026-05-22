
-- 1. Fix creator_profiles INSERT: require creator role
DROP POLICY IF EXISTS "Users can create own creator profile" ON public.creator_profiles;
CREATE POLICY "Users can create own creator profile"
  ON public.creator_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND has_role(auth.uid(), 'creator'::app_role));

-- 2. Fix POI images upload: add folder-based ownership check
DROP POLICY IF EXISTS "Authenticated users can upload poi images" ON storage.objects;
CREATE POLICY "Authenticated users can upload poi images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'poi-images'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
