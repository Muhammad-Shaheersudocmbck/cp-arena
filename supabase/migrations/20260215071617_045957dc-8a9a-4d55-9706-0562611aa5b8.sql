
-- Fix: Allow any authenticated user to accept a waiting challenge (set player2_id)
-- by adding a policy that allows updating matches with a challenge_code when player2_id is null
CREATE POLICY "Anyone can accept open challenges"
ON public.matches
FOR UPDATE
USING (
  auth.uid() IS NOT NULL
  AND challenge_code IS NOT NULL
  AND player2_id IS NULL
  AND status = 'waiting'
);

-- Create notification trigger for new announcements
CREATE OR REPLACE FUNCTION public.notify_on_announcement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, link)
  SELECT p.id, 'New Announcement: ' || NEW.title, LEFT(NEW.message, 200), 'announcement', '/announcements'
  FROM public.profiles p;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_announcement_created
AFTER INSERT ON public.announcements
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_announcement();

-- Create notification trigger for new DMs
CREATE OR REPLACE FUNCTION public.notify_on_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  sender_username TEXT;
BEGIN
  SELECT username INTO sender_username FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, title, message, type, link)
  VALUES (
    NEW.receiver_id,
    'New message from ' || COALESCE(sender_username, 'Someone'),
    LEFT(NEW.message, 100),
    'message',
    '/messages/' || NEW.sender_id
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER on_dm_sent
AFTER INSERT ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_dm();
