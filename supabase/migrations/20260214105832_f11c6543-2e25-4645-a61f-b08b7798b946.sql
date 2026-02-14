
-- Fix SECURITY DEFINER view warning - recreate as SECURITY INVOKER
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = true) AS
  SELECT id, user_id, username, avatar, rating, rank, cf_handle,
         cf_rating, wins, losses, draws, is_banned, created_at,
         updated_at, online_at
  FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated, anon;
