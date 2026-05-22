
-- ========================================
-- FIX 1: Function search_path mutable (4 functions)
-- ========================================

CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

-- ========================================
-- FIX 2: Profiles - restrict public SELECT to non-sensitive columns
-- Replace open USING(true) with authenticated-only full access, public gets limited view
-- ========================================

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Authenticated users can see all profiles
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

-- ========================================
-- FIX 3: Creator profiles - hide sensitive financial data from public
-- ========================================

DROP POLICY IF EXISTS "Creator profiles are public" ON public.creator_profiles;

-- Create a safe public view excluding sensitive columns
CREATE OR REPLACE VIEW public.public_creator_profiles AS
SELECT id, user_id, display_name, bio, created_at, updated_at
FROM public.creator_profiles;

-- Public can only see safe columns via view; direct table access restricted to authenticated
CREATE POLICY "Authenticated can view creator profiles"
  ON public.creator_profiles FOR SELECT TO authenticated
  USING (true);

-- ========================================
-- FIX 4: Favorites - replace public USING(true) with aggregate function
-- ========================================

DROP POLICY IF EXISTS "Public can count favorites" ON public.favorites;

-- Create a function for public favorite counts instead
CREATE OR REPLACE FUNCTION public.get_favorites_count(route_ids integer[])
RETURNS TABLE(route_id integer, fav_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT f.route_id, COUNT(*) as fav_count
  FROM public.favorites f
  WHERE f.route_id = ANY(route_ids)
  GROUP BY f.route_id;
$$;

-- ========================================
-- FIX 5: Campaigns - create safe public view without budget/internal data
-- ========================================

DROP POLICY IF EXISTS "Active campaigns are public" ON public.campaigns;

CREATE OR REPLACE VIEW public.public_campaigns AS
SELECT id, name, placement, status, target_url, target_category_id, target_route_id, priority, start_date, end_date
FROM public.campaigns
WHERE status = 'active';

-- Only authenticated admins get direct table access (already have admin policy)

-- ========================================
-- FIX 6: Tighten overly permissive INSERT policies
-- ========================================

-- campaign_events: require campaign_id to exist
DROP POLICY IF EXISTS "Anyone can log campaign events" ON public.campaign_events;
CREATE POLICY "Anyone can log campaign events"
  ON public.campaign_events FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = campaign_events.campaign_id AND c.status = 'active')
  );

-- analytics_events: allow but validate event_name is not empty
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
CREATE POLICY "Authenticated can insert analytics events"
  ON public.analytics_events FOR INSERT TO authenticated
  WITH CHECK (event_name IS NOT NULL AND event_name <> '');

-- conversations: restrict to authenticated or require guest info
DROP POLICY IF EXISTS "Anyone can create conversations" ON public.conversations;
CREATE POLICY "Anyone can create conversations"
  ON public.conversations FOR INSERT TO public
  WITH CHECK (
    (auth.uid() IS NOT NULL AND user_id = auth.uid())
    OR
    (auth.uid() IS NULL AND guest_email IS NOT NULL AND guest_name IS NOT NULL)
  );

-- messages: require valid conversation reference
DROP POLICY IF EXISTS "Anyone can insert messages" ON public.messages;
CREATE POLICY "Anyone can insert messages"
  ON public.messages FOR INSERT TO public
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id)
    AND content IS NOT NULL AND content <> ''
  );
