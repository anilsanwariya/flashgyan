-- AI usage: the tokens each kind of AI call uses a day (fresh input, input
-- written to and read from the prompt cache, output), for the admin's
-- "AI usage" page and to see what prompt caching saves.
CREATE TABLE IF NOT EXISTS public.ai_usage (
  day date NOT NULL,
  -- The start of the call's instructions ("You write vocabulary cards…").
  label text NOT NULL,
  model text NOT NULL DEFAULT '',
  calls integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  cache_write_tokens bigint NOT NULL DEFAULT 0,
  cache_read_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, label, model)
);
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage TO service_role;

-- One call's tokens added to its day (India time) and label.
CREATE OR REPLACE FUNCTION public.ai_usage_add(
  p_label text,
  p_model text,
  p_input bigint,
  p_cache_write bigint,
  p_cache_read bigint,
  p_output bigint
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.ai_usage AS u
    (day, label, model, calls, input_tokens, cache_write_tokens, cache_read_tokens, output_tokens)
  VALUES (
    (now() AT TIME ZONE 'Asia/Kolkata')::date,
    left(coalesce(p_label, ''), 160),
    coalesce(p_model, ''),
    1,
    greatest(coalesce(p_input, 0), 0),
    greatest(coalesce(p_cache_write, 0), 0),
    greatest(coalesce(p_cache_read, 0), 0),
    greatest(coalesce(p_output, 0), 0)
  )
  ON CONFLICT (day, label, model) DO UPDATE SET
    calls = u.calls + 1,
    input_tokens = u.input_tokens + excluded.input_tokens,
    cache_write_tokens = u.cache_write_tokens + excluded.cache_write_tokens,
    cache_read_tokens = u.cache_read_tokens + excluded.cache_read_tokens,
    output_tokens = u.output_tokens + excluded.output_tokens,
    updated_at = now();
$$;
REVOKE EXECUTE ON FUNCTION public.ai_usage_add(text, text, bigint, bigint, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_usage_add(text, text, bigint, bigint, bigint, bigint)
  TO service_role;
