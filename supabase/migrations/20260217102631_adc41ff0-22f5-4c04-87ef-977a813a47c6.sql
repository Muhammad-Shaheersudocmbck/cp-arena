-- Fix: Allow service role (auth.uid() IS NULL) to update protected fields
-- This is needed because the arena-engine edge function uses service role key
CREATE OR REPLACE FUNCTION public.enforce_profile_update_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If auth.uid() is NULL, this is a service role or server-side call - allow all changes
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If user is admin, allow all changes
  IF public.is_admin(auth.uid()) THEN
    -- But prevent banning other admins
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned AND NEW.is_banned = true THEN
      IF public.is_admin(OLD.user_id) THEN
        RAISE EXCEPTION 'Cannot ban an admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Only admins can change ban status';
  END IF;
  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'Only admins can change rating';
  END IF;
  IF NEW.rank IS DISTINCT FROM OLD.rank THEN
    RAISE EXCEPTION 'Only admins can change rank';
  END IF;
  IF NEW.wins IS DISTINCT FROM OLD.wins THEN
    RAISE EXCEPTION 'Only admins can change wins';
  END IF;
  IF NEW.losses IS DISTINCT FROM OLD.losses THEN
    RAISE EXCEPTION 'Only admins can change losses';
  END IF;
  IF NEW.draws IS DISTINCT FROM OLD.draws THEN
    RAISE EXCEPTION 'Only admins can change draws';
  END IF;

  RETURN NEW;
END;
$function$;
