// Admin server functions for the monthly magazine's official documents.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { DocAddition, MonthDoc } from "@/lib/ca-docs.server";

export type { DocAddition, MonthDoc };

async function server() {
  return import("@/lib/ca-docs.server");
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

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date");
const id = z.string().uuid();

export const listCaDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ month: dateSchema }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    const [list, work] = await Promise.all([s.listDocuments(data.month), s.docWork(data.month)]);
    return { ...list, work };
  });

export const addCaDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: dateSchema,
        name: z.string().trim().max(300),
        released_by: z.string().trim().max(120),
        date: dateSchema,
        focus: z.string().trim().max(300).nullable().optional(),
        content: z.string().min(1).max(600_000).optional(),
        url: z.string().url().max(2000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    let { content, name } = data;
    // A link (a web page or a PDF): read it first.
    if (!content && data.url) {
      const { readPage } = await import("@/lib/ca-collect.server");
      const page = await readPage(data.url);
      if (!page) throw new Error("That link couldn't be read.");
      content = page.text;
      name = name || page.title;
    }
    if (!content) throw new Error("Add a file, a link or some text.");
    return (await server()).addDocument(data.month, {
      name,
      released_by: data.released_by,
      date: data.date,
      focus: data.focus ?? null,
      content,
      url: data.url ?? null,
    });
  });

export const deleteCaDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).deleteDocument(data.id);
    return { ok: true };
  });

export const decideCaDocAddition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id, approve: z.boolean(), also_daily: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    await (await server()).decideAddition(data.id, data.approve, data.also_daily ?? false);
    return { ok: true };
  });

// A custom magazine's suggestions from its material (new facts, corrections).
export const listCaMagSuggestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await (await server()).listSuggestions({ magazine: data.id })).filter(
      (a) => a.status === "pending",
    );
  });

export const writeCaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ source: id }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return (await server()).writeReport(data.source);
  });

export const changeCaReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        month: dateSchema,
        source: id,
        action: z.enum(["include", "leave_out", "remove", "up", "down"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const s = await server();
    if (data.action === "include" || data.action === "leave_out")
      await s.setReportIncluded(data.month, data.source, data.action === "include");
    else if (data.action === "remove") await s.removeReport(data.month, data.source);
    else await s.moveReport(data.month, data.source, data.action === "up" ? -1 : 1);
    return { ok: true };
  });

// One unit of document work from the page ("Speed up").
export const stepCaDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return { step: await (await server()).docStep() };
  });
