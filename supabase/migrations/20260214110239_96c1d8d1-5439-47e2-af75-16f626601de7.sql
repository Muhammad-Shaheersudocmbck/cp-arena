
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text NOT NULL DEFAULT '',
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Group chats
CREATE TABLE public.group_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.group_chats ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_chat_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

ALTER TABLE public.group_chat_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.group_chats(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id),
  message text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Group chat RLS policies
-- Members can view their groups
CREATE POLICY "Members can view groups"
  ON public.group_chats FOR SELECT
  USING (id IN (SELECT group_id FROM group_chat_members WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())));

-- Authenticated users can create groups
CREATE POLICY "Authenticated users can create groups"
  ON public.group_chats FOR INSERT
  WITH CHECK (created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Creator can update group
CREATE POLICY "Creator can update group"
  ON public.group_chats FOR UPDATE
  USING (created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Creator can delete group
CREATE POLICY "Creator can delete group"
  ON public.group_chats FOR DELETE
  USING (created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Group members policies
CREATE POLICY "Members can view group members"
  ON public.group_chat_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_chat_members WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())));

CREATE POLICY "Group creator can add members"
  ON public.group_chat_members FOR INSERT
  WITH CHECK (
    group_id IN (SELECT id FROM group_chats WHERE created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
    OR user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "Members can leave group"
  ON public.group_chat_members FOR DELETE
  USING (user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR group_id IN (SELECT id FROM group_chats WHERE created_by IN (SELECT id FROM profiles WHERE user_id = auth.uid())));

-- Group messages policies
CREATE POLICY "Members can view group messages"
  ON public.group_messages FOR SELECT
  USING (group_id IN (SELECT group_id FROM group_chat_members WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())));

CREATE POLICY "Members can send group messages"
  ON public.group_messages FOR INSERT
  WITH CHECK (
    sender_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    AND group_id IN (SELECT group_id FROM group_chat_members WHERE user_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()))
  );

-- Enable realtime for group messages and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
