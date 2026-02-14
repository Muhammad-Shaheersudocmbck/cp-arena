
-- Fix overly permissive matches policies
DROP POLICY "System can insert matches" ON public.matches;
DROP POLICY "System can update matches" ON public.matches;

-- Only authenticated users can be involved in matches
CREATE POLICY "Authenticated can insert matches" ON public.matches FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    player1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  )
);

CREATE POLICY "Match participants or admins can update" ON public.matches FOR UPDATE 
USING (
  auth.uid() IS NOT NULL AND (
    player1_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR player2_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR public.is_admin(auth.uid())
  )
);
