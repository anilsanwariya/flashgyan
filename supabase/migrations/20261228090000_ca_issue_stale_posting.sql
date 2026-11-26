-- A magazine issue left "posting" (the bot was stopped mid-post: a time
-- limit, a redeploy) is taken again after 10 minutes instead of staying
-- stuck. Each edition's message id is saved as soon as it is sent, so the
-- retry sends only what is missing. Safe to run again.
CREATE OR REPLACE FUNCTION public.ca_claim_due_issue()
RETURNS SETOF public.ca_issues
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.ca_issues
  SET status = 'posting', updated_at = now()
  WHERE id = (
    SELECT id FROM public.ca_issues
    WHERE pdf_path IS NOT NULL
      AND (
        (status = 'scheduled' AND scheduled_for <= now())
        OR (status = 'posting' AND updated_at < now() - interval '10 minutes')
      )
    ORDER BY scheduled_for
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *
$$;
REVOKE EXECUTE ON FUNCTION public.ca_claim_due_issue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ca_claim_due_issue() TO service_role;
