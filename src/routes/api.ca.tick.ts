import { createFileRoute } from "@tanstack/react-router";

// Advances the automatic current affairs collection by one short tick. Called
// by pg_cron, which must send the scheduler secret in the x-cron-secret header.
async function run(request: Request) {
  const { verifyCronSecret } = await import("@/lib/cron-secret.server");
  if (!(await verifyCronSecret(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tick } = await import("@/lib/ca-collect.server");
  try {
    return Response.json(await tick(new URL(request.url).origin));
  } catch (e) {
    console.error("ca tick", e);
    return Response.json({ error: "Tick failed" }, { status: 500 });
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
