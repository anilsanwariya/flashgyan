import { createFileRoute } from "@tanstack/react-router";

// Checks a student's Mains answer (typed or photos); streams CheckStreamEvent lines.
export const Route = createFileRoute("/api/saathi/check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSaathiCheck } = await import("@/lib/saathi-check.server");
        return handleSaathiCheck(request);
      },
    },
  },
});
