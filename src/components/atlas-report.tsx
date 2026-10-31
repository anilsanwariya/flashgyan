// Students' "Report a mistake" in the atlas: a fact, a place or a district
// page, what's wrong and (if they know) what's right, sent to the editor.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportAtlasMistake } from "@/lib/atlas.functions";
import type { AtlasLang } from "@/lib/atlas";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const L = (lang: AtlasLang, hi: string, en: string) => (lang === "hi" ? hi : en);

export function ReportButton({
  lang,
  kind,
  refKey,
  label,
  compact = false,
}: {
  lang: AtlasLang;
  kind: "fact" | "place" | "district";
  refKey: string;
  label: string;
  // A small flag (beside a fact) instead of a button.
  compact?: boolean;
}) {
  const fn = useServerFn(reportAtlasMistake);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [correction, setCorrection] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await fn({
        data: {
          kind,
          ref: refKey,
          label: label.slice(0, 600),
          message: message.trim(),
          correction: correction.trim(),
          page: window.location.pathname.slice(0, 300),
        },
      });
      if (r.ok) {
        toast.success(
          L(
            lang,
            "धन्यवाद! हम इसे जाँचकर ठीक करेंगे।",
            "Thank you! We'll check it and put it right.",
          ),
        );
        setOpen(false);
        setMessage("");
        setCorrection("");
      } else
        toast.error(
          r.reason === "limit"
            ? L(
                lang,
                "अभी बहुत रिपोर्ट भेजी गईं, थोड़ी देर बाद भेजें।",
                "Too many reports just now: try again later.",
              )
            : L(lang, "अभी रिपोर्ट नहीं भेज सके।", "Reports can't be sent just now."),
        );
    } catch {
      toast.error(L(lang, "भेज नहीं सके: इंटरनेट जाँचें", "Couldn't send: check the internet"));
    } finally {
      setBusy(false);
    }
  };
  const what = {
    fact: L(lang, "तथ्य", "fact"),
    place: L(lang, "स्थान", "place"),
    district: L(lang, "जिला पृष्ठ", "district page"),
  }[kind];
  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={L(lang, "इस तथ्य में गलती बताएँ", "Report a mistake in this fact")}
          title={L(lang, "गलती बताएँ", "Report a mistake")}
          className="ml-1 inline-grid h-5 w-5 place-items-center rounded align-middle text-muted-foreground/60 hover:bg-muted hover:text-destructive"
        >
          <Flag className="h-3 w-3" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
        >
          <Flag className="h-3.5 w-3.5" /> {L(lang, "गलती बताएँ", "Report a mistake")}
        </button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{L(lang, "गलती बताएँ", "Report a mistake")}</DialogTitle>
            <DialogDescription>
              {L(lang, `इस ${what} में क्या गलत है?`, `What's wrong with this ${what}?`)}
            </DialogDescription>
          </DialogHeader>
          <p className="line-clamp-4 rounded-lg bg-muted/50 p-2 text-sm">{label}</p>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">{L(lang, "क्या गलत है", "What's wrong")}</span>
            <textarea
              aria-label={L(lang, "क्या गलत है", "What's wrong")}
              rows={3}
              maxLength={1500}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">
              {L(
                lang,
                "सही क्या है, और आपने कहाँ पढ़ा (यदि पता हो)",
                "What's right, and where you read it (if you know)",
              )}
            </span>
            <textarea
              aria-label={L(lang, "सही जानकारी", "What's right")}
              rows={2}
              maxLength={1500}
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              className="w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || message.trim().length < 8}
            onClick={send}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {L(lang, "भेजें", "Send")}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
