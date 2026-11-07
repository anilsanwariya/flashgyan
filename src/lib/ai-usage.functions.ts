// The admin's AI usage page: tokens, cost and prompt-cache savings.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const getAiUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ days: z.number().int().min(1).max(90) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await import("@/lib/ai-usage.server")).getAiUsage(data.days);
  });

// Background jobs through Message Batches (half price): on or off each.
export const getAiBatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const B = await import("@/lib/ai-batch.server");
    return { on: await B.batchSettings(), names: B.BATCH_JOBS };
  });

export const setAiBatchSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ job: z.enum(["studio_jobs", "exam_read"]), on: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await import("@/lib/ai-batch.server")).setBatchOn(data.job, data.on);
    return { ok: true };
  });
