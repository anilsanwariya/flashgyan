// Finished practice sessions: recorded from the student pages, read on the
// admin's Practice sessions page.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SESSION_KINDS } from "@/lib/practice-sessions";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin access required");
}

// Public: a student finished a session. Rate-limited per address.
export const recordPracticeSession = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ kind: z.enum(SESSION_KINDS) }).parse(d))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const { clientIp } = await import("@/lib/saathi-ask.server");
    const { recordSession } = await import("@/lib/practice-sessions.server");
    return recordSession(data.kind, clientIp(getRequest()));
  });

export const getPracticeSessions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(90) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await import("@/lib/practice-sessions.server")).sessionsView(data.days);
  });
