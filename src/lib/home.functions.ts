import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "home-banners";

export type HomeBanner = {
  id: string;
  storage_path: string;
  order_index: number;
  url: string;
};

export type HomeSettings = {
  cta_label: string;
  cta_subtitle: string;
  cta_url: string;
  lock_flashcards: boolean;
  lock_mcq: boolean;
  lock_saathi: boolean;
  lock_cta: boolean;
};

export type HomeData = {
  banners: HomeBanner[];
  settings: HomeSettings;
};

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function publicUrl(supabase: ReturnType<typeof publicClient>, path: string) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const admin = await getAdmin();
  const { data: isAdmin, error } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!isAdmin) throw new Error("Forbidden: admin role required");
  return admin;
}

const DEFAULT_SETTINGS: HomeSettings = {
  cta_label: "",
  cta_url: "",
  lock_flashcards: false,
  lock_mcq: false,
  lock_saathi: false,
  lock_cta: false,
};

export const getHomeData = createServerFn({ method: "GET" }).handler(
  async (): Promise<HomeData> => {
    const supabase = publicClient();
    const [{ data: banners, error: bErr }, { data: settings, error: sErr }] = await Promise.all([
      supabase
        .from("home_banners")
        .select("id, storage_path, order_index")
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("home_settings")
        .select("cta_label, cta_url, lock_flashcards, lock_mcq, lock_saathi, lock_cta")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    if (bErr) throw new Error(bErr.message);
    if (sErr) throw new Error(sErr.message);
    return {
      banners: (banners ?? []).map((b) => ({
        id: b.id,
        storage_path: b.storage_path,
        order_index: b.order_index,
        url: publicUrl(supabase, b.storage_path),
      })),
      settings: (settings as HomeSettings | null) ?? DEFAULT_SETTINGS,
    };
  },
);

export const uploadHomeBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        dataBase64: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const ext = (data.filename.split(".").pop() || "jpg").toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = Buffer.from(data.dataBase64, "base64");
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, bytes, { upsert: false, contentType: data.contentType });
    if (upErr) throw new Error(upErr.message);
    const { data: maxRow } = await admin
      .from("home_banners")
      .select("order_index")
      .order("order_index", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (maxRow?.order_index ?? -1) + 1;
    const { error: insErr } = await admin
      .from("home_banners")
      .insert({ storage_path: path, order_index: nextOrder });
    if (insErr) throw new Error(insErr.message);
    return { ok: true };
  });

export const deleteHomeBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { data: row, error: rErr } = await admin
      .from("home_banners")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (row?.storage_path) {
      await admin.storage.from(BUCKET).remove([row.storage_path]);
    }
    const { error: dErr } = await admin.from("home_banners").delete().eq("id", data.id);
    if (dErr) throw new Error(dErr.message);
    return { ok: true };
  });

export const reorderHomeBanners = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await admin
        .from("home_banners")
        .update({ order_index: i })
        .eq("id", data.ids[i]);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateHomeSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        cta_label: z.string().max(80).default(""),
        cta_url: z.string().max(2000).default(""),
        lock_flashcards: z.boolean(),
        lock_mcq: z.boolean(),
        lock_saathi: z.boolean(),
        lock_cta: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await assertAdmin(context.userId);
    const { error } = await admin
      .from("home_settings")
      .update({
        cta_label: data.cta_label.trim(),
        cta_url: data.cta_url.trim(),
        lock_flashcards: data.lock_flashcards,
        lock_mcq: data.lock_mcq,
        lock_saathi: data.lock_saathi,
        lock_cta: data.lock_cta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
