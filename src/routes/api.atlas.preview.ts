import { createFileRoute } from "@tanstack/react-router";

// The picture a shared atlas link shows: ?place=<key> or ?district=<name>.
// Falls back to the site's own picture when one can't be made.
async function run(request: Request) {
  const url = new URL(request.url);
  const place = url.searchParams.get("place");
  const district = url.searchParams.get("district");
  const { previewPng, SITE_PREVIEW } = await import("@/lib/atlas-share.server");
  try {
    const png =
      place && place.length <= 200
        ? await previewPng("place", place)
        : district && district.length <= 60
          ? await previewPng("district", district)
          : null;
    if (png)
      return new Response(png as BodyInit, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=86400",
        },
      });
  } catch (e) {
    console.error("atlas preview:", e instanceof Error ? e.message : e);
  }
  return Response.redirect(SITE_PREVIEW, 302);
}

export const Route = createFileRoute("/api/atlas/preview")({
  server: { handlers: { GET: ({ request }) => run(request) } },
});
