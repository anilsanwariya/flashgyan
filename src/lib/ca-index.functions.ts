// Admin server functions for the monthly's topic index.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function server() {
  return import("@/lib/ca-index.server");
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

const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);
const bi = z.object({ en: z.string().max(120), hi: z.string().max(120) });

export const getCaIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getIndex(data.month);
  });

export const stepCaIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ month, offset: z.number().int().min(0).max(100_000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).indexStep(data.month, data.offset);
  });

export const saveCaIndex = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month,
        index: z
          .object({
            made_at: z.string().max(40),
            entries: z
              .array(
                z.object({
                  term: bi,
                  kind: z.string().max(20),
                  items: z.array(z.string().max(60)).max(500),
                }),
              )
              .max(3000),
          })
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveIndex(data.month, data.index);
  });
