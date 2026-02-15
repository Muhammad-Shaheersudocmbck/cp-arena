
-- Fix profiles SELECT policies: change from RESTRICTIVE to PERMISSIVE
-- This is the root cause of players not seeing other players, empty leaderboard, and broken group creation

-- Drop existing restrictive SELECT policies
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own full profile" ON public.profiles;

-- Create permissive SELECT policies
-- All authenticated users can view profiles (email is protected via SAFE_PROFILE_COLUMNS in app code and public_profiles view)
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);
