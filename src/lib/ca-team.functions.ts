// The magazine's editorial team (admin): scorecards and notebook history.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function server() {
  return import("@/lib/ca-team.server");
}

async function assertAdmin(userId: string) {
  const { requireAdminMfa } = await import("@/lib/admin-mfa.server");
  await requireAdminMfa(userId);
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

const member = z.enum(["chief", "writer", "proofreader", "updater"]);
const notebookMember = z.enum(["proofreader", "updater"]);

export const getCaTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).teamOverview();
  });

export const restoreCaTeamNotebook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ member, at: z.string().min(10).max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { rules: await (await server()).restoreNotebook(data.member, data.at) };
  });

// The Proofreader's and the Updater's notebooks: lessons kept or written by
// hand, suggestions kept or dropped, and suggestions asked for now.
export const saveCaTeamLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        member: notebookMember,
        rules: z.array(z.string().trim().min(3).max(240)).max(15),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveLessons(data.member, data.rules);
  });

export const decideCaTeamSuggestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ member: notebookMember, rule: z.string().min(1).max(240), keep: z.boolean() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).decideSuggestion(data.member, data.rule, data.keep);
  });

export const suggestCaTeamLessons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ member: notebookMember }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).suggestLessons(data.member);
  });
