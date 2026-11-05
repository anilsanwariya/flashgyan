// Admin two-factor sign-in (TOTP authenticator apps) in the browser: which step an
// admin's session needs next. The server and database enforce the same rule.
import { supabase } from "@/integrations/supabase/client";

export type MfaStep = "done" | "verify" | "enroll";

// Set for this tab when the project can't enroll authenticators (two-factor is
// switched off in Supabase Auth), so the admin isn't locked out.
const UNAVAILABLE_KEY = "fg-mfa-unavailable";

export function markMfaUnavailable() {
  try {
    sessionStorage.setItem(UNAVAILABLE_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}

function mfaUnavailable() {
  try {
    return sessionStorage.getItem(UNAVAILABLE_KEY) === "1";
  } catch {
    return false;
  }
}

// "verify": has an authenticator, needs today's code. "enroll": has none yet.
export async function mfaStep(): Promise<MfaStep> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (data.currentLevel === "aal2") return "done";
  if (data.nextLevel === "aal2") return "verify";
  return mfaUnavailable() ? "done" : "enroll";
}

// Errors from enroll() that mean two-factor is switched off for the project.
export function isMfaDisabledError(e: unknown) {
  const err = e as { code?: string; message?: string } | null;
  return /not_enabled|disabled/i.test(`${err?.code ?? ""} ${err?.message ?? ""}`);
}
