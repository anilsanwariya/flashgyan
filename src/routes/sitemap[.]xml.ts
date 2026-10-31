import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SITE_URL } from "@/lib/app-promo";

const STATIC_PATHS = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/flashcards", priority: "0.8", changefreq: "weekly" },
  { path: "/mcq-practice", priority: "0.8", changefreq: "weekly" },
  { path: "/mcq-tests", priority: "0.8", changefreq: "weekly" },
  { path: "/saathi", priority: "0.5", changefreq: "monthly" },
  { path: "/atlas", priority: "0.8", changefreq: "weekly" },
  { path: "/atlas/quiz", priority: "0.6", changefreq: "monthly" },
  { path: "/privacy-policy", priority: "0.2", changefreq: "yearly" },
  { path: "/terms", priority: "0.2", changefreq: "yearly" },
];

function urlEntry(loc: string, priority: string, changefreq: string) {
  return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
}

// Generated on request so every flashcard deck page is listed for search engines.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          },
        );
        const [{ data: decks, error }, { data: settings }] = await Promise.all([
          supabase.from("flashcard_decks").select("id"),
          supabase.from("home_settings").select("*").eq("id", 1).maybeSingle(),
        ]);
        if (error) console.error("sitemap: could not list decks", error.message);

        // Don't advertise SAATHI to search engines while it is locked or hidden.
        const saathiOff = Boolean(settings?.lock_saathi || settings?.hide_saathi);
        // The atlas while its card is shown, with every published district page.
        const atlasOff = Boolean((settings as { hide_atlas?: boolean } | null)?.hide_atlas);
        const districts = atlasOff
          ? []
          : await (await import("@/lib/atlas.server")).publishedDistricts().catch(() => []);
        const entries = [
          ...STATIC_PATHS.filter(
            (p) =>
              !(saathiOff && p.path === "/saathi") && !(atlasOff && p.path.startsWith("/atlas")),
          ).map((p) => urlEntry(`${SITE_URL}${p.path}`, p.priority, p.changefreq)),
          ...(decks ?? []).map((d) => urlEntry(`${SITE_URL}/decks/${d.id}`, "0.7", "weekly")),
          ...districts.map((d) =>
            urlEntry(`${SITE_URL}/atlas/${encodeURIComponent(d.district)}`, "0.7", "monthly"),
          ),
        ];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
