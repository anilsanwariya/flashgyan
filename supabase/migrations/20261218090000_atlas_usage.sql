-- How the students' atlas is used, counted by day (no student is
-- identified): places and districts opened, map quiz answers by district,
-- daily challenges played and searches that found nothing. Written and
-- read only by the server.
CREATE TABLE IF NOT EXISTS public.atlas_usage (
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('place', 'district', 'quiz_right', 'quiz_wrong', 'daily', 'search_miss')),
  ref text NOT NULL,
  n integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, ref)
);
GRANT ALL ON public.atlas_usage TO service_role;
ALTER TABLE public.atlas_usage ENABLE ROW LEVEL SECURITY;

-- Adds counts for today (India's date): [{"kind": "place", "ref": "fort:x", "n": 1}, …].
CREATE OR REPLACE FUNCTION public.atlas_usage_bump(p_rows jsonb)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.atlas_usage (day, kind, ref, n)
  SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date, r->>'kind', left(r->>'ref', 200),
         sum(greatest(1, least(coalesce((r->>'n')::int, 1), 100)))::int
  FROM jsonb_array_elements(p_rows) r
  WHERE r->>'kind' IN ('place', 'district', 'quiz_right', 'quiz_wrong', 'daily', 'search_miss')
    AND coalesce(r->>'ref', '') <> ''
  GROUP BY r->>'kind', left(r->>'ref', 200)
  ON CONFLICT (day, kind, ref) DO UPDATE SET n = public.atlas_usage.n + EXCLUDED.n;
$$;
REVOKE EXECUTE ON FUNCTION public.atlas_usage_bump(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_usage_bump(jsonb) TO service_role;
