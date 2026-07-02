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

function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/admin" });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/admin" },
        });
        if (error) throw error;
        toast.success("Account created. Check email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-2xl font-extrabold tracking-tight">
            {mode === "signin" ? "Admin sign in" : "Create admin account"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Only the admin needs to sign in. Students don't need an account.
          </p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="h-12 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-xl border-border/40"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                className="h-12 rounded-2xl bg-white/60 dark:bg-black/40 backdrop-blur-xl border-border/40"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 rounded-[24px] bg-primary/10 text-primary font-semibold text-[17px] border border-primary/20 backdrop-blur-xl hover:bg-primary/20 active:scale-[0.98] transition-all shadow-[0_4px_24px_rgba(var(--primary),0.1)] disabled:opacity-50 disabled:active:scale-100"
            >
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 text-sm font-semibold text-primary/80 hover:text-primary transition-colors"
          >
            {mode === "signin" ? "Need an account? Sign up" : "Have an account? Sign in"}
          </button>
        </div>
      </main>
    </div>
  );
}
