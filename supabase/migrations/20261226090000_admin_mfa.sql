-- Two-factor sign-in for admins, enforced in the database too. Once a user has a
-- verified authenticator (TOTP), their roles only count in sessions that passed it
-- (assurance level aal2), so a stolen password alone can't use the admin policies.
-- Users without an authenticator are unaffected, so this is safe to run before
-- anyone sets one up. Safe to run more than once. The server applies the same rule
-- (src/lib/admin-mfa.server.ts).

CREATE OR REPLACE FUNCTION public.mfa_satisfied()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      OR NOT EXISTS (
        SELECT 1 FROM auth.mfa_factors f
        WHERE f.user_id = auth.uid() AND f.status = 'verified'
      )
$$;
REVOKE ALL ON FUNCTION public.mfa_satisfied() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mfa_satisfied() TO authenticated, service_role;

-- The policies call these. Same signatures and grants as before; now they also
-- require the authenticator when the user has one.
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND public.mfa_satisfied()
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND public.mfa_satisfied()
$$;
