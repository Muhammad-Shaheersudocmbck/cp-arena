
-- Contest standings table for leaderboard
CREATE TABLE public.contest_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  score integer NOT NULL DEFAULT 0,
  penalty_time integer NOT NULL DEFAULT 0,
  problems_solved integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.contest_standings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view contest standings"
  ON public.contest_standings FOR SELECT
  USING (true);

CREATE POLICY "Service or admin can insert standings"
  ON public.contest_standings FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR auth.uid() IS NOT NULL);

CREATE POLICY "Service or admin can update standings"
  ON public.contest_standings FOR UPDATE
  USING (is_admin(auth.uid()) OR (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid())));

-- Contest submissions to track individual problem solves
CREATE TABLE public.contest_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  problem_id uuid NOT NULL REFERENCES public.contest_problems(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  solved_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contest_id, problem_id, user_id)
);

ALTER TABLE public.contest_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view contest submissions"
  ON public.contest_submissions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can insert contest submissions"
  ON public.contest_submissions FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Add cf_contest_id and cf_problem_index to contest_problems for CF integration
ALTER TABLE public.contest_problems ADD COLUMN IF NOT EXISTS cf_contest_id integer;
ALTER TABLE public.contest_problems ADD COLUMN IF NOT EXISTS cf_problem_index text;
