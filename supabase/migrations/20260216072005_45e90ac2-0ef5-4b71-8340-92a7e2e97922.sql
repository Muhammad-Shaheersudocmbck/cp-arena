
-- 1. Update finalize_match to use dynamic K-factor based on games played
CREATE OR REPLACE FUNCTION public.finalize_match(_match_id uuid, _winner_id uuid, _resigned_by uuid DEFAULT NULL::uuid, _is_draw boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _match RECORD;
  _p1 RECORD;
  _p2 RECORD;
  _score_a NUMERIC;
  _expected_a NUMERIC;
  _change_a INTEGER;
  _change_b INTEGER;
  _k1 INTEGER;
  _k2 INTEGER;
  _p1_games INTEGER;
  _p2_games INTEGER;
BEGIN
  SELECT * INTO _match FROM public.matches WHERE id = _match_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  
  IF NOT (
    EXISTS(SELECT 1 FROM profiles WHERE id = _match.player1_id AND user_id = auth.uid()) OR
    EXISTS(SELECT 1 FROM profiles WHERE id = _match.player2_id AND user_id = auth.uid()) OR
    public.is_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'Not a participant or admin';
  END IF;

  SELECT * INTO _p1 FROM public.profiles WHERE id = _match.player1_id;
  SELECT * INTO _p2 FROM public.profiles WHERE id = _match.player2_id;

  -- Calculate total games for dynamic K-factor
  _p1_games := _p1.wins + _p1.losses + _p1.draws;
  _p2_games := _p2.wins + _p2.losses + _p2.draws;
  
  -- Dynamic K-factor: newcomers get bigger swings
  -- < 10 games: K=48, 10-30 games: K=32, 30+ games: K=24
  IF _p1_games < 10 THEN _k1 := 48;
  ELSIF _p1_games < 30 THEN _k1 := 32;
  ELSE _k1 := 24;
  END IF;
  
  IF _p2_games < 10 THEN _k2 := 48;
  ELSIF _p2_games < 30 THEN _k2 := 32;
  ELSE _k2 := 24;
  END IF;

  IF _winner_id IS NULL THEN
    _score_a := 0.5;
  ELSIF _winner_id = _match.player1_id THEN
    _score_a := 1;
  ELSE
    _score_a := 0;
  END IF;

  _expected_a := 1.0 / (1.0 + power(10.0, (_p2.rating - _p1.rating)::numeric / 400.0));
  _change_a := round(_k1 * (_score_a - _expected_a));
  _change_b := round(_k2 * ((1 - _score_a) - (1 - _expected_a)));

  UPDATE public.matches SET
    status = 'finished',
    winner_id = _winner_id,
    resigned_by = _resigned_by,
    player1_rating_change = _change_a,
    player2_rating_change = _change_b,
    draw_offered_by = NULL
  WHERE id = _match_id;

  UPDATE public.profiles SET
    rating = _p1.rating + _change_a,
    rank = CASE
      WHEN _p1.rating + _change_a < 900 THEN 'Beginner'
      WHEN _p1.rating + _change_a < 1100 THEN 'Newbie'
      WHEN _p1.rating + _change_a < 1300 THEN 'Pupil'
      WHEN _p1.rating + _change_a < 1500 THEN 'Specialist'
      WHEN _p1.rating + _change_a < 1700 THEN 'Expert'
      WHEN _p1.rating + _change_a < 1900 THEN 'Candidate Master'
      WHEN _p1.rating + _change_a < 2100 THEN 'Master'
      ELSE 'Grandmaster'
    END,
    wins = _p1.wins + (CASE WHEN _score_a = 1 THEN 1 ELSE 0 END),
    losses = _p1.losses + (CASE WHEN _score_a = 0 THEN 1 ELSE 0 END),
    draws = _p1.draws + (CASE WHEN _score_a = 0.5 THEN 1 ELSE 0 END)
  WHERE id = _match.player1_id;

  UPDATE public.profiles SET
    rating = _p2.rating + _change_b,
    rank = CASE
      WHEN _p2.rating + _change_b < 900 THEN 'Beginner'
      WHEN _p2.rating + _change_b < 1100 THEN 'Newbie'
      WHEN _p2.rating + _change_b < 1300 THEN 'Pupil'
      WHEN _p2.rating + _change_b < 1500 THEN 'Specialist'
      WHEN _p2.rating + _change_b < 1700 THEN 'Expert'
      WHEN _p2.rating + _change_b < 1900 THEN 'Candidate Master'
      WHEN _p2.rating + _change_b < 2100 THEN 'Master'
      ELSE 'Grandmaster'
    END,
    wins = _p2.wins + (CASE WHEN _score_a = 0 THEN 1 ELSE 0 END),
    losses = _p2.losses + (CASE WHEN _score_a = 1 THEN 1 ELSE 0 END),
    draws = _p2.draws + (CASE WHEN _score_a = 0.5 THEN 1 ELSE 0 END)
  WHERE id = _match.player2_id;
END;
$function$;

-- 2. Prevent admins from being banned
CREATE OR REPLACE FUNCTION public.enforce_profile_update_restrictions()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- If user is admin, allow all changes
  IF public.is_admin(auth.uid()) THEN
    -- But prevent banning other admins
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned AND NEW.is_banned = true THEN
      IF public.is_admin(OLD.user_id) THEN
        RAISE EXCEPTION 'Cannot ban an admin';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Only admins can change ban status';
  END IF;
  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'Only admins can change rating';
  END IF;
  IF NEW.rank IS DISTINCT FROM OLD.rank THEN
    RAISE EXCEPTION 'Only admins can change rank';
  END IF;
  IF NEW.wins IS DISTINCT FROM OLD.wins THEN
    RAISE EXCEPTION 'Only admins can change wins';
  END IF;
  IF NEW.losses IS DISTINCT FROM OLD.losses THEN
    RAISE EXCEPTION 'Only admins can change losses';
  END IF;
  IF NEW.draws IS DISTINCT FROM OLD.draws THEN
    RAISE EXCEPTION 'Only admins can change draws';
  END IF;

  RETURN NEW;
END;
$function$;
