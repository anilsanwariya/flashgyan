import { createFileRoute } from "@tanstack/react-router";

// Advances the automatic current affairs collection by one short tick. Only
// does work that is already due (the evening collection, or one an admin
// started), so it is safe to call from pg_cron without credentials.
async function run(request: Request) {
  const { tick } = await import("@/lib/ca-collect.server");
  try {
    return Response.json(await tick(new URL(request.url).origin));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/ca/tick")({
  server: {
    handlers: {
      GET: ({ request }) => run(request),
      POST: ({ request }) => run(request),
    },
  },
});
