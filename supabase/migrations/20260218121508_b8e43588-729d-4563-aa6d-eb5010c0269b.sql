
-- Contests table
CREATE TABLE public.contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  start_time timestamp with time zone,
  duration integer NOT NULL DEFAULT 7200,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published contests" ON public.contests
  FOR SELECT USING (status != 'draft' OR created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid()));

CREATE POLICY "Admins and authors can create contests" ON public.contests
  FOR INSERT WITH CHECK (is_admin(auth.uid()) OR created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Creator or admin can update contest" ON public.contests
  FOR UPDATE USING (created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()) OR is_admin(auth.uid()));

CREATE POLICY "Admin can delete contest" ON public.contests
  FOR DELETE USING (is_admin(auth.uid()));

-- Contest authors (admins can assign author role to users for a specific contest)
CREATE TABLE public.contest_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  added_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.contest_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view contest authors" ON public.contest_authors
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage contest authors" ON public.contest_authors
  FOR INSERT WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can delete contest authors" ON public.contest_authors
  FOR DELETE USING (is_admin(auth.uid()));

-- Contest problems
CREATE TABLE public.contest_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  problem_order integer NOT NULL DEFAULT 1,
  problem_label text NOT NULL DEFAULT 'A',
  problem_url text NOT NULL,
  problem_name text DEFAULT '',
  points integer DEFAULT 100,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.contest_problems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view contest problems of published contests" ON public.contest_problems
  FOR SELECT USING (
    contest_id IN (SELECT id FROM contests WHERE status != 'draft')
    OR contest_id IN (SELECT contest_id FROM contest_authors WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR is_admin(auth.uid())
  );

CREATE POLICY "Authors and admins can add problems" ON public.contest_problems
  FOR INSERT WITH CHECK (
    contest_id IN (SELECT contest_id FROM contest_authors WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR is_admin(auth.uid())
  );

CREATE POLICY "Authors and admins can update problems" ON public.contest_problems
  FOR UPDATE USING (
    contest_id IN (SELECT contest_id FROM contest_authors WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR is_admin(auth.uid())
  );

CREATE POLICY "Authors and admins can delete problems" ON public.contest_problems
  FOR DELETE USING (
    contest_id IN (SELECT contest_id FROM contest_authors WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR is_admin(auth.uid())
  );

-- Contest registrations
CREATE TABLE public.contest_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  registered_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(contest_id, user_id)
);

ALTER TABLE public.contest_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view registrations" ON public.contest_registrations
  FOR SELECT USING (true);

CREATE POLICY "Users can register" ON public.contest_registrations
  FOR INSERT WITH CHECK (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can unregister" ON public.contest_registrations
  FOR DELETE USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.contests;

-- Trigger for updated_at
CREATE TRIGGER update_contests_updated_at
  BEFORE UPDATE ON public.contests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();
