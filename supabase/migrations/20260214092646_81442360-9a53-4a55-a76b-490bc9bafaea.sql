CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  avatar_url TEXT;
  user_email TEXT;
BEGIN
  user_email := NEW.email;
  avatar_url := 'https://api.dicebear.com/7.x/bottts/svg?seed=' || encode(extensions.gen_random_bytes(8), 'hex');
  
  INSERT INTO public.profiles (user_id, email, username, avatar)
  VALUES (NEW.id, user_email, split_part(user_email, '@', 1), avatar_url);
  
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  
  IF user_email IN ('farazsoomro229@gmail.com', 'shaheermain573@gmail.com') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  END IF;
  
  RETURN NEW;
END;
$$;