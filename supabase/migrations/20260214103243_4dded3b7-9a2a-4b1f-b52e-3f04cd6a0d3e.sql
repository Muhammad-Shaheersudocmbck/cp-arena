
-- 1. Add challenge_code to matches
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS challenge_code text UNIQUE;

-- 2. Add online_at to profiles for online status
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS online_at timestamp with time zone;

-- 3. Friends table
CREATE TABLE public.friends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, friend_id)
);
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own friendships" ON public.friends FOR SELECT USING (
  user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR friend_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Users can send friend requests" ON public.friends FOR INSERT WITH CHECK (
  user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Users can update own friendships" ON public.friends FOR UPDATE USING (
  friend_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Users can delete own friendships" ON public.friends FOR DELETE USING (
  user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR friend_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);

-- 4. Direct messages table
CREATE TABLE public.direct_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message text NOT NULL,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own DMs" ON public.direct_messages FOR SELECT USING (
  sender_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR receiver_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Users can send DMs" ON public.direct_messages FOR INSERT WITH CHECK (
  sender_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Users can update own received DMs" ON public.direct_messages FOR UPDATE USING (
  receiver_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);

-- 5. Announcements table
CREATE TABLE public.announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  message text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view announcements" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Admins can create announcements" ON public.announcements FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can update announcements" ON public.announcements FOR UPDATE USING (is_admin(auth.uid()));
CREATE POLICY "Admins can delete announcements" ON public.announcements FOR DELETE USING (is_admin(auth.uid()));

-- 6. Blacklisted problems table
CREATE TABLE public.blacklisted_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id integer NOT NULL,
  problem_index text NOT NULL,
  reason text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.blacklisted_problems ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view blacklist" ON public.blacklisted_problems FOR SELECT USING (true);
CREATE POLICY "Admins can manage blacklist" ON public.blacklisted_problems FOR INSERT WITH CHECK (is_admin(auth.uid()));
CREATE POLICY "Admins can delete blacklist" ON public.blacklisted_problems FOR DELETE USING (is_admin(auth.uid()));

-- 7. Site settings table
CREATE TABLE public.site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}',
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view settings" ON public.site_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON public.site_settings FOR UPDATE USING (is_admin(auth.uid()));
INSERT INTO public.site_settings (key, value) VALUES ('maintenance_mode', '{"enabled": false, "message": "Site is under maintenance"}');

-- 8. Blogs table
CREATE TABLE public.blogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
ALTER TABLE public.blogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view blogs" ON public.blogs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create blogs" ON public.blogs FOR INSERT WITH CHECK (
  author_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
);
CREATE POLICY "Authors can update own blogs" ON public.blogs FOR UPDATE USING (
  author_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR is_admin(auth.uid())
);
CREATE POLICY "Authors or admins can delete blogs" ON public.blogs FOR DELETE USING (
  author_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid())
  OR is_admin(auth.uid())
);
CREATE TRIGGER update_blogs_updated_at BEFORE UPDATE ON public.blogs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 9. Enable realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friends;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
