
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'super_admin');

-- Create match_status enum
CREATE TYPE public.match_status AS ENUM ('waiting', 'active', 'finished');

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  email TEXT NOT NULL,
  username TEXT,
  avatar TEXT,
  rating INT NOT NULL DEFAULT 1000,
  rank TEXT NOT NULL DEFAULT 'Newbie',
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  draws INT NOT NULL DEFAULT 0,
  cf_handle TEXT,
  cf_rating INT,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE(user_id, role)
);

-- Matches table
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status match_status NOT NULL DEFAULT 'waiting',
  contest_id INT,
  problem_index TEXT,
  problem_name TEXT,
  problem_rating INT,
  start_time TIMESTAMPTZ,
  duration INT NOT NULL DEFAULT 900,
  winner_id UUID REFERENCES public.profiles(id),
  player1_id UUID REFERENCES public.profiles(id) NOT NULL,
  player2_id UUID REFERENCES public.profiles(id),
  player1_solved_at TIMESTAMPTZ,
  player2_solved_at TIMESTAMPTZ,
  player1_rating_change INT,
  player2_rating_change INT,
  match_type TEXT NOT NULL DEFAULT '1v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue table
CREATE TABLE public.queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating_min INT NOT NULL DEFAULT 800,
  rating_max INT NOT NULL DEFAULT 1600,
  duration INT NOT NULL DEFAULT 900,
  tags TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reports table
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) NOT NULL,
  reported_user_id UUID REFERENCES public.profiles(id) NOT NULL,
  match_id UUID REFERENCES public.matches(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match chat messages
CREATE TABLE public.match_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_messages ENABLE ROW LEVEL SECURITY;

-- Helper function: check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Helper: is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin', 'super_admin')
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avatar_url TEXT;
  user_email TEXT;
BEGIN
  user_email := NEW.email;
  avatar_url := 'https://api.dicebear.com/7.x/bottts/svg?seed=' || encode(gen_random_bytes(8), 'hex');
  
  INSERT INTO public.profiles (user_id, email, username, avatar)
  VALUES (NEW.id, user_email, split_part(user_email, '@', 1), avatar_url);
  
  -- Default role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  
  -- Auto-assign super_admin
  IF user_email IN ('farazsoomro229@gmail.com', 'shaheermain573@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies

-- Profiles: anyone can read, owners can update
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE USING (public.is_admin(auth.uid()));

-- User roles: admins can read all, users see own
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR INSERT WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Super admins can delete roles" ON public.user_roles FOR DELETE USING (public.has_role(auth.uid(), 'super_admin'));

-- Matches: anyone can read
CREATE POLICY "Anyone can view matches" ON public.matches FOR SELECT USING (true);
CREATE POLICY "System can insert matches" ON public.matches FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update matches" ON public.matches FOR UPDATE USING (true);

-- Queue: own entries
CREATE POLICY "Users can view own queue" ON public.queue FOR SELECT USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can join queue" ON public.queue FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can leave queue" ON public.queue FOR DELETE USING (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can manage queue" ON public.queue FOR ALL USING (public.is_admin(auth.uid()));

-- Reports
CREATE POLICY "Users can create reports" ON public.reports FOR INSERT WITH CHECK (
  reporter_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Users can view own reports" ON public.reports FOR SELECT USING (
  reporter_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "Admins can view all reports" ON public.reports FOR SELECT USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins can update reports" ON public.reports FOR UPDATE USING (public.is_admin(auth.uid()));

-- Match messages
CREATE POLICY "Anyone can read match messages" ON public.match_messages FOR SELECT USING (true);
CREATE POLICY "Users can send messages" ON public.match_messages FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Enable realtime for matches and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.queue;
