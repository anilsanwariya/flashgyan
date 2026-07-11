
-- Revoke broad EXECUTE on SECURITY DEFINER functions from PUBLIC, anon, and authenticated.
-- RLS policies referencing has_role() still work because policy evaluation uses the
-- function owner's privileges, not the caller's EXECUTE grant.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.match_saathi_knowledge(vector, integer, text) FROM PUBLIC, anon, authenticated;

-- Keep service_role able to call these from server-side code.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.match_saathi_knowledge(vector, integer, text) TO service_role;
