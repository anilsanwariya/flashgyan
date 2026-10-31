import { createFileRoute, redirect } from "@tanstack/react-router";

// The daily challenge's short link (shared on Telegram).
export const Route = createFileRoute("/atlas/daily")({
  beforeLoad: () => {
    throw redirect({ to: "/atlas/quiz", search: { daily: 1 } });
  },
});
