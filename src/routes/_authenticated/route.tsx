import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { mfaStep } from "@/lib/admin-mfa";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Password only so far: the sign-in page asks for the authenticator code (or set-up).
    if ((await mfaStep()) !== "done") throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: () => <Outlet />,
});
