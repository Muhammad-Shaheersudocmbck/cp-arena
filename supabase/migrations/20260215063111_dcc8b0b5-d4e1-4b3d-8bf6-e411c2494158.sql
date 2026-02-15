
-- 1. Add edited_at column to direct_messages for edit tracking
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;

-- 2. Allow senders to UPDATE their own messages (for editing)
CREATE POLICY "Senders can update own DMs"
  ON public.direct_messages FOR UPDATE
  TO authenticated
  USING (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Drop old update policy that only allows receivers
DROP POLICY IF EXISTS "Users can update own received DMs" ON public.direct_messages;

-- Recreate receiver update policy (for marking read_at)
CREATE POLICY "Receivers can update received DMs"
  ON public.direct_messages FOR UPDATE
  TO authenticated
  USING (receiver_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 3. Allow senders to DELETE their own messages
CREATE POLICY "Senders can delete own DMs"
  ON public.direct_messages FOR DELETE
  TO authenticated
  USING (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 4. Add edited_at to group_messages
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone DEFAULT NULL;

-- 5. Allow senders to UPDATE group messages (edit)
CREATE POLICY "Senders can update own group messages"
  ON public.group_messages FOR UPDATE
  TO authenticated
  USING (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 6. Allow senders to DELETE group messages
CREATE POLICY "Senders can delete own group messages"
  ON public.group_messages FOR DELETE
  TO authenticated
  USING (sender_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));

-- 7. Add reply_to column to direct_messages
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS reply_to uuid DEFAULT NULL REFERENCES public.direct_messages(id);

-- 8. Add reply_to column to group_messages
ALTER TABLE public.group_messages ADD COLUMN IF NOT EXISTS reply_to uuid DEFAULT NULL REFERENCES public.group_messages(id);

-- 9. Add draw_offered_by to matches for draw flow
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS draw_offered_by uuid DEFAULT NULL;

-- 10. Add resigned_by to matches for resign flow
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS resigned_by uuid DEFAULT NULL;
