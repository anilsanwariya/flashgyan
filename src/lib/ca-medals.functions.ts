// Admin server functions for a sports event's medal tally.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function server() {
  return import("@/lib/ca-medals.server");
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

const event_id = z.string().uuid();
const bi = z.object({ en: z.string().max(200), hi: z.string().max(200) });
const n = z.number().int().min(0).max(9999);
const tally = z.object({
  made_at: z.string().max(40),
  medals: z
    .array(z.object({ who: bi, state: bi, what: bi, medal: z.enum(["gold", "silver", "bronze"]) }))
    .max(200),
  reported: z.object({ gold: n, silver: n, bronze: n, rank: n.nullable() }).nullable(),
  table: z.array(z.object({ country: bi, gold: n, silver: n, bronze: n })).max(10),
});

export const getCaMedals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getMedals(data.event_id);
  });

export const makeCaMedals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).makeMedals(data.event_id);
  });

export const saveCaMedals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ event_id, tally: tally.nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveMedals(data.event_id, data.tally);
  });
