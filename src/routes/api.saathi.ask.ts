import { createFileRoute } from "@tanstack/react-router";

// Streams SAATHI answers as newline-delimited JSON (see SaathiStreamEvent).
export const Route = createFileRoute("/api/saathi/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSaathiAsk } = await import("@/lib/saathi-ask.server");
        return handleSaathiAsk(request);
      },
    },
  },
});
