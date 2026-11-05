// Admin two-factor sign-in screens: entering the code from an authenticator app,
// setting one up (QR code), and the admin's Sign-in security page.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isMfaDisabledError, markMfaUnavailable } from "@/lib/admin-mfa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Supabase returns the QR code as raw SVG in a data URL; a "#" in it (colours) cuts the
// URL short and the image breaks, so it is re-encoded.
function qrSrc(qr: string): string {
  const raw = qr.match(/^data:image\/svg\+xml;(?:utf-8|charset=utf-8),(<svg[\s\S]*)$/i)?.[1];
  return raw ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(raw)}` : qr;
}

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

function CodeForm({
  submitLabel,
  onSubmit,
}: {
  submitLabel: string;
  onSubmit: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(code);
        } catch (err) {
          toast.error(errorText(err, "That code didn't work. Try the newest code."));
          setCode("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label
        htmlFor="mfa-code"
        className="text-xs font-bold uppercase tracking-widest text-muted-foreground"
      >
        6-digit code
      </Label>
      <Input
        id="mfa-code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        className="h-12 rounded-2xl text-center text-xl tracking-[0.4em] tabular-nums"
      />
      <Button
        type="submit"
        className="w-full h-12 rounded-2xl"
        disabled={busy || code.length !== 6}
      >
        {busy ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}

// An admin with an authenticator enters today's code. With several authenticators,
// the code is tried against each until one accepts it.
export function MfaVerify({ onDone }: { onDone: () => void }) {
  return (
    <CodeForm
      submitLabel="Verify"
      onSubmit={async (code) => {
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (error) throw error;
        const factors = data.totp.filter((f) => f.status === "verified");
        let last: unknown = new Error("No authenticator is set up for this account.");
        for (const f of factors) {
          const res = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
          if (!res.error) return onDone();
          last = res.error;
        }
        throw last;
      }}
    />
  );
}

// Sets up an authenticator: shows its QR code (and the key, for typing in), then
// confirms it with a first code. onUnavailable: two-factor is off for the project.
export function MfaEnroll({
  onDone,
  onUnavailable,
}: {
  onDone: () => void;
  onUnavailable?: () => void;
}) {
  const [setup, setSetup] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        // Clear half-finished set-ups left by an earlier attempt.
        const { data: list } = await supabase.auth.mfa.listFactors();
        for (const f of list?.all ?? []) {
          if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
        }
        const { data, error } = await supabase.auth.mfa.enroll({
          factorType: "totp",
          issuer: "FlashGyan",
          friendlyName: `FlashGyan admin ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
        });
        if (error) throw error;
        setSetup({ id: data.id, qr: qrSrc(data.totp.qr_code), secret: data.totp.secret });
      } catch (e) {
        if (isMfaDisabledError(e) && onUnavailable) {
          markMfaUnavailable();
          setFailed(
            "Two-factor sign-in is switched off for this project. Turn on TOTP under Supabase Auth → Multi-Factor in Lovable Cloud, then sign in again.",
          );
        } else {
          setFailed(errorText(e, "Couldn't start the set-up."));
        }
      }
    })();
  }, [onUnavailable]);

  if (failed)
    return (
      <div className="space-y-3">
        <p className="rounded-xl bg-amber-500/10 p-3 text-sm">{failed}</p>
        {onUnavailable && /switched off/.test(failed) && (
          <Button variant="outline" className="w-full rounded-2xl" onClick={onUnavailable}>
            Continue without two-factor for now
          </Button>
        )}
      </div>
    );
  if (!setup) return <p className="text-sm text-muted-foreground">Preparing your QR code…</p>;
  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground/80">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator, Authy…).</li>
        <li>Scan this QR code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex justify-center rounded-2xl bg-white p-3">
        <img
          src={setup.qr}
          alt="QR code to add FlashGyan to your authenticator app"
          className="h-44 w-44"
        />
      </div>
      <p
        className="break-all rounded-xl bg-muted/60 p-2 text-center font-mono text-xs"
        aria-label="Setup key"
      >
        {setup.secret}
      </p>
      <CodeForm
        submitLabel="Turn on two-factor"
        onSubmit={async (code) => {
          const { error } = await supabase.auth.mfa.challengeAndVerify({
            factorId: setup.id,
            code,
          });
          if (error) throw error;
          onDone();
        }}
      />
    </div>
  );
}

type Factor = { id: string; friendly_name?: string; status: string; created_at: string };

// Admin → System → Sign-in security: the account's authenticators, adding a backup
// one, and removing one (never the last).
export function SignInSecurityPanel() {
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) return toast.error(error.message);
    setFactors((data.totp as Factor[]).filter((f) => f.status === "verified"));
  };
  useEffect(() => {
    void load();
  }, []);

  const remove = async (f: Factor) => {
    if (!confirm(`Remove "${f.friendly_name ?? "authenticator"}"? Its codes will stop working.`))
      return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return toast.error(error.message);
    toast.success("Authenticator removed");
    void load();
  };

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Admin sign-in needs your password and a 6-digit code from an authenticator app. Add a backup
        authenticator (for example on a second phone) so losing one phone doesn&apos;t lock you out.
      </p>
      {factors === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {factors.map((f) => (
            <li key={f.id} className="flex items-center gap-3 p-3">
              <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {f.friendly_name ?? "Authenticator app"}
                </p>
                <p className="text-xs text-muted-foreground">Added {f.created_at.slice(0, 10)}</p>
              </div>
              {factors.length > 1 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void remove(f)}
                  aria-label="Remove authenticator"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </li>
          ))}
          {!factors.length && (
            <li className="p-3 text-sm text-muted-foreground">No authenticator yet.</li>
          )}
        </ul>
      )}
      {adding ? (
        <div className="rounded-xl border border-border p-4">
          <MfaEnroll
            onDone={() => {
              toast.success("Backup authenticator added");
              setAdding(false);
              void load();
            }}
          />
        </div>
      ) : (
        <Button variant="outline" onClick={() => setAdding(true)}>
          Add a backup authenticator
        </Button>
      )}
      <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
        Lost every authenticator? The project owner can remove them in Lovable&apos;s SQL editor:{" "}
        <code>
          delete from auth.mfa_factors where user_id = (select id from auth.users where email =
          &apos;you@example.com&apos;);
        </code>{" "}
        Then sign in with your password and set up a new one.
      </div>
    </div>
  );
}
