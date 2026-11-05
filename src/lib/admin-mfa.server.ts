// Server-only: admins who set up an authenticator app must use it. Once a user has a
// verified authenticator, admin work is refused in a session that only passed the
// password (assurance level aal1). Users without one pass here, and the admin sign-in
// makes them set one up before the admin area opens. The database applies the same
// rule in has_role (migration 20261226090000_admin_mfa.sql).
import { Buffer } from "buffer";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MFA_REQUIRED =
  "Two-factor code required. Sign in again and enter the 6-digit code from your authenticator app.";

// The assurance level of this request's token. requireSupabaseAuth has already
// verified the token's signature in this request, so reading its claims is safe.
function tokenClaims(): { sub?: string; aal?: string } | null {
  const header = getRequest()?.headers.get("authorization") ?? "";
  const payload = header.startsWith("Bearer ") ? header.slice(7).split(".")[1] : undefined;
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

// Whether a session at this level may do admin work, given the user's authenticators.
export function mfaSatisfied(aal: string | undefined, factors: { status: string }[]): boolean {
  return aal === "aal2" || !factors.some((f) => f.status === "verified");
}

export async function requireAdminMfa(userId: string) {
  const claims = tokenClaims();
  if (claims?.sub && claims.sub !== userId) throw new Error("Unauthorized: token mismatch");
  if (claims?.aal === "aal2") return;
  const { data, error } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`Couldn't check two-factor sign-in: ${error.message}`);
  if (!mfaSatisfied(claims?.aal, data.factors)) throw new Error(MFA_REQUIRED);
}
