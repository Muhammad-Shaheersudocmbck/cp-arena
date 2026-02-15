
CREATE OR REPLACE FUNCTION public.finalize_match(
  _match_id uuid,
  _winner_id uuid,
  _resigned_by uuid DEFAULT NULL,
  _is_draw boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _match RECORD;
  _p1 RECORD;
  _p2 RECORD;
  _score_a NUMERIC;
  _expected_a NUMERIC;
  _change_a INTEGER;
  _change_b INTEGER;
  _k INTEGER := 32;
BEGIN
  -- Get match
  SELECT * INTO _match FROM public.matches WHERE id = _match_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found or not active';
  END IF;

  -- Verify caller is a participant
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

  -- Get players
  SELECT * INTO _p1 FROM public.profiles WHERE id = _match.player1_id;
  SELECT * INTO _p2 FROM public.profiles WHERE id = _match.player2_id;

  -- Calculate score
  IF _winner_id IS NULL THEN
    _score_a := 0.5;
  ELSIF _winner_id = _match.player1_id THEN
    _score_a := 1;
  ELSE
    _score_a := 0;
  END IF;

  -- Elo calculation
  _expected_a := 1.0 / (1.0 + power(10.0, (_p2.rating - _p1.rating)::numeric / 400.0));
  _change_a := round(_k * (_score_a - _expected_a));
  _change_b := round(_k * ((1 - _score_a) - (1 - _expected_a)));

  -- Update match
  UPDATE public.matches SET
    status = 'finished',
    winner_id = _winner_id,
    resigned_by = _resigned_by,
    player1_rating_change = _change_a,
    player2_rating_change = _change_b,
    draw_offered_by = NULL
  WHERE id = _match_id;

  -- Update player 1
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

  -- Update player 2
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
$$;
