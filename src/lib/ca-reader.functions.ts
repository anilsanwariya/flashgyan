// The current affairs web reader: public reads of posted days, and the
// editor's switch taking a day off the website.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function server() {
  return import("@/lib/ca-reader.server");
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

const lang = z.enum(["en", "hi"]).default("hi");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// A day's page is the same for everyone until it changes: kept for a few
// minutes so busy mornings don't rebuild it on every visit.
const DAY_TTL_MS = 5 * 60_000;
const dayCache = new Map<string, { at: number; value: unknown }>();

export const listCaReaderDays = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ lang, before: date.nullish() }).parse(d ?? {}))
  .handler(async ({ data }) => (await server()).listDays(data.lang, data.before ?? null));

export const getCaReaderDay = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ date, lang }).parse(d))
  .handler(async ({ data }) => {
    const key = `${data.date}:${data.lang}`;
    const hit = dayCache.get(key);
    if (hit && Date.now() - hit.at < DAY_TTL_MS)
      return hit.value as Awaited<ReturnType<Awaited<ReturnType<typeof server>>["readDay"]>>;
    const value = await (await server()).readDay(data.date, data.lang);
    if (dayCache.size > 200) dayCache.clear();
    dayCache.set(key, { at: Date.now(), value });
    return value;
  });

// ---------- Admin ----------

export const getCaReaderDayStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return { onWebsite: await (await server()).dayOnWebsite(data.date) };
  });

export const setCaReaderDayHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date, hidden: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).setDayHidden(data.date, data.hidden);
    for (const l of ["en", "hi"]) dayCache.delete(`${data.date}:${l}`);
    return { ok: true };
  });
