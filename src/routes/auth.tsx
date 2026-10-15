import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin sign in — Flashgyan" }] }),
  component: Auth,
});

type Mode = "signin" | "forgot" | "reset";

// The admin's sign-in. There is no public sign-up: admin accounts are made by
// the project owner. A password-reset link brings the admin back here to set
// a new password.
function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(() =>
    typeof window !== "undefined" &&
    (new URLSearchParams(window.location.search).has("reset") ||
      window.location.hash.includes("type=recovery"))
      ? "reset"
      : "signin",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
    if (mode !== "reset") {
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) navigate({ to: "/admin" });
      });
    }
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth?reset=1`,
        });
        if (error) throw error;
        toast.success("If this email has an admin account, a reset link is on its way.");
        setMode("signin");
        return;
      }
      if (mode === "reset") {
        if (password !== confirm) throw new Error("The two passwords don't match");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        toast.success("Password changed");
        navigate({ to: "/admin" });
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  const title =
    mode === "signin"
      ? "Admin sign in"
      : mode === "forgot"
        ? "Reset your password"
        : "Set a new password";
  const hint =
    mode === "signin"
      ? "Only the admin needs to sign in. Students don't need an account."
      : mode === "forgot"
        ? "Enter your admin email and we'll send you a link to set a new password."
        : "Choose a new password for your admin account.";
  const field = "h-12 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-xl border-border/40";
  const label = "text-xs font-bold uppercase tracking-widest text-muted-foreground";

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-primary/10 via-background to-secondary/10 relative overflow-hidden">
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -top-32 -left-20 h-[420px] w-[420px] rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 -right-24 h-[480px] w-[480px] rounded-full bg-secondary/30 blur-[120px]" />

      <header className="px-5 pt-6 relative z-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/70 hover:text-foreground rounded-full h-10 px-4 bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-border/30 transition-all active:scale-95"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
      </header>

      <main className="flex-1 grid place-items-center px-5 relative z-10">
        <div className="w-full max-w-sm rounded-[32px] p-8 bg-white/50 dark:bg-black/40 backdrop-blur-3xl border border-border/30 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)]">
          <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            {mode !== "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="email" className={label}>
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className={field}
                />
              </div>
            )}
            {mode !== "forgot" && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className={label}>
                    {mode === "reset" ? "New password" : "Password"}
                  </Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-semibold text-primary/80 hover:text-primary"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={mode === "reset" ? 8 : 6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "reset" ? "new-password" : "current-password"}
                  className={field}
                />
              </div>
            )}
            {mode === "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className={label}>
                  New password again
                </Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={field}
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-[24px] bg-primary/10 text-primary font-semibold text-[17px] border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.1)] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading
                ? "…"
                : mode === "signin"
                  ? "Sign in"
                  : mode === "forgot"
                    ? "Send reset link"
                    : "Save new password"}
            </button>
          </form>
          {mode === "forgot" && (
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="mt-5 text-sm font-semibold text-primary/80 hover:text-primary transition-colors"
            >
              Back to sign in
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
