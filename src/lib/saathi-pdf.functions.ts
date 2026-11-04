// Server function: parse a PDF via LlamaCloud's LlamaParse API and return markdown.
// Requires LLAMA_CLOUD_API_KEY in server env. Admins only: each parse spends LlamaParse credits.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
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

export const parsePdfWithLlama = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        filename: z.string().trim().min(1).max(300),
        // base64-encoded PDF bytes (no data: prefix)
        base64: z.string().min(1),
        // Document medium; picks the OCR language for scanned pages.
        medium: z.enum(["Hindi", "English", "Bilingual"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { parsePdfBytes } = await import("@/lib/saathi-pdf.server");
    return parsePdfBytes(b64ToBytes(data.base64), data);
  });
