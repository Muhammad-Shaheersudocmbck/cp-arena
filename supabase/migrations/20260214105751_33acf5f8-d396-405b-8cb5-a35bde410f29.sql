
-- FIX 1: Prevent non-admin users from modifying protected columns on their own profile
-- Replace the permissive "Users can update own profile" policy with a restricted one
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Create a trigger function that blocks non-admin users from changing protected columns
CREATE OR REPLACE FUNCTION public.enforce_profile_update_restrictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If user is admin, allow all changes
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- For non-admin users, prevent changes to protected columns
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
$$;

CREATE TRIGGER enforce_profile_update_restrictions_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_update_restrictions();

-- Re-create the user update policy (still scoped to own profile)
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- FIX 2: Protect email from public exposure
-- Replace the open SELECT policy with owner-only access
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;

-- Owner can see their full profile (including email)
CREATE POLICY "Users can view own full profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- Create a public view without email for other users
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, user_id, username, avatar, rating, rank, cf_handle,
         cf_rating, wins, losses, draws, is_banned, created_at,
         updated_at, online_at
  FROM public.profiles;

-- Grant access to the view
GRANT SELECT ON public.public_profiles TO authenticated, anon;

-- Admins still need to see all profiles for admin operations
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));
