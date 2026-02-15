
-- Create blog_comments table
CREATE TABLE public.blog_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blog_id uuid NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id),
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  edited_at timestamp with time zone
);

ALTER TABLE public.blog_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view blog comments"
  ON public.blog_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create comments"
  ON public.blog_comments FOR INSERT
  TO authenticated
  WITH CHECK (author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Authors can update own comments"
  ON public.blog_comments FOR UPDATE
  TO authenticated
  USING (author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Authors or admins can delete comments"
  ON public.blog_comments FOR DELETE
  TO authenticated
  USING (
    author_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    OR is_admin(auth.uid())
  );
