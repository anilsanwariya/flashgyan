// Admin server functions for notes books: their covers and front pages.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BookSummary } from "@/lib/notes-books.server";

export type { BookSummary };

async function server() {
  return import("@/lib/notes-books.server");
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

const id = z.string().uuid();
const stage = z.enum(["prelims", "mains"]);
const draft = z.record(z.string(), z.unknown());
const part = z.enum([
  "cover",
  "imprint",
  "about",
  "howto",
  "contents",
  "coverage",
  "pyq",
  "sources",
]);

export const listNotesBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return (await server()).listBooks();
  });

export const createNotesBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ section: z.string().trim().min(2).max(80), stage }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).createBook(data.section, data.stage);
  });

export const getNotesBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).getBook(data.id);
  });

export const saveNotesBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, cover: draft.optional(), front: draft.optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).saveBook(data.id, { cover: data.cover, front: data.front });
  });

export const deleteNotesBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteBook(data.id);
    return { ok: true };
  });

// The cover and front pages as HTML, with unsaved changes when given.
export const previewNotesBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        lang: z.enum(["en", "hi"]),
        parts: z.array(part).max(8).optional(),
        cover: draft.optional(),
        front: draft.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ html: string }> => {
    await assertAdmin(context.userId);
    return {
      html: await (
        await server()
      ).bookHtml(data.id, data.lang, data.parts, {
        cover: data.cover,
        front: data.front,
      }),
    };
  });

// ---------- The planner ----------

async function planner() {
  return import("@/lib/notes-plan.server");
}

export const getNotesPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await planner()).getPlan(data.id);
  });

// The next topics checked against the knowledge base.
export const planNotesStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id,
        redo: z.array(id).max(50).optional(),
        since: z.string().datetime().optional(),
        skip: z.array(id).max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await planner()).planStep(data.id, data);
  });
