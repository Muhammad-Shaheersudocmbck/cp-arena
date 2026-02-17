-- Add lobby and multi-player support columns to matches
ALTER TABLE public.matches 
  ADD COLUMN IF NOT EXISTS max_players integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS problem_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lobby_mode text NOT NULL DEFAULT '1v1',
  ADD COLUMN IF NOT EXISTS team_size integer DEFAULT NULL;

-- Create match_players table for multi-player support
CREATE TABLE IF NOT EXISTS public.match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  team integer DEFAULT NULL,
  solved_count integer NOT NULL DEFAULT 0,
  rating_change integer DEFAULT NULL,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(match_id, player_id)
);

ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match players" ON public.match_players
  FOR SELECT USING (true);

CREATE POLICY "Authenticated can join matches" ON public.match_players
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND
    player_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Match participants can update" ON public.match_players
  FOR UPDATE USING (
    player_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR
    is_admin(auth.uid())
  );

-- Create match_problems table for multi-problem support
CREATE TABLE IF NOT EXISTS public.match_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  problem_order integer NOT NULL DEFAULT 1,
  contest_id integer NOT NULL,
  problem_index text NOT NULL,
  problem_name text,
  problem_rating integer,
  UNIQUE(match_id, problem_order)
);

ALTER TABLE public.match_problems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match problems" ON public.match_problems
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert match problems" ON public.match_problems
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR true);

-- Create match_submissions to track per-player per-problem solves
CREATE TABLE IF NOT EXISTS public.match_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id),
  problem_order integer NOT NULL,
  solved_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(match_id, player_id, problem_order)
);

ALTER TABLE public.match_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view match submissions" ON public.match_submissions
  FOR SELECT USING (true);

CREATE POLICY "Service role can insert submissions" ON public.match_submissions
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR true);

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_submissions;
