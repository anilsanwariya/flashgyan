// Admin server functions for maps: searching the place list (for the notes'
// and the stories' map editors).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

export const findMapPlaces = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        query: z.string().trim().min(2).max(80),
        near: z.object({ lat: z.number(), lon: z.number() }).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { searchPlaces } = await import("@/lib/geo-places");
    return searchPlaces(data.query, data.near ?? null, 12);
  });

// A map drawn as it prints (for the editors' previews).
export const previewMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        map: z.unknown(),
        lang: z.enum(["en", "hi"]),
        accent: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        review: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ html: string }> => {
    await assertAdmin(context.userId);
    const { normalizeMap, MAP_CSS } = await import("@/lib/map-spec");
    const { noteMapHtml } = await import("@/lib/notes-map");
    const map = normalizeMap(data.map);
    if (!map) return { html: "" };
    const accent = data.accent ?? "#6d28d9";
    return {
      html: `<!doctype html><html lang="${data.lang}"><head><meta charset="utf-8"/><style>body{margin:0;padding:8px;font-family:"Noto Sans","Noto Sans Devanagari",sans-serif;font-size:12px;color:#1f2430;background:#fff}.dn{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;background:${accent};color:#fff;font-size:10px;font-weight:700}sup.ai{color:#c2410c}${MAP_CSS}</style></head><body>${noteMapHtml(map, data.lang, accent, data.review)}</body></html>`,
    };
  });
