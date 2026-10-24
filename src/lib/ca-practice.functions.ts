// Admin server functions for the monthly practice set and one-liners.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function server() {
  return import("@/lib/ca-practice.server");
}

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

const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "Use a YYYY-MM month");

export const getCaPractice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const [practice, oneliners] = await Promise.all([
      s.getPractice(data.month),
      s.getOneliners(data.month),
    ]);
    return { practice, oneliners };
  });

export const stepCaPractice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month, part: z.number().int().min(0).max(2) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).practiceStep(data.month, data.part);
  });

export const replaceCaPracticeQ = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month, index: z.number().int().min(0).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).replaceQuestion(data.month, data.index);
  });

// The set after the editor's changes (null takes it out of the issue).
export const saveCaPractice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month, set: z.unknown() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).savePractice(data.month, data.set ?? null);
  });

export const stepCaOneliners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month, offset: z.number().int().min(0).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).onelinerStep(data.month, data.offset);
  });

export const saveCaOneliners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month, list: z.unknown() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveOneliners(data.month, data.list ?? null);
  });
