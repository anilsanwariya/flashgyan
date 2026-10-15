// A quiet line of keyboard shortcuts, shown only on devices with a mouse or
// trackpad (phones and touch tablets never see it).
export function KeyHints({ hints }: { hints: [keys: string, action: string][] }) {
  return (
    <p className="mt-3 hidden [@media(hover:hover)_and_(pointer:fine)]:flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {hints.map(([keys, action]) => (
        <span key={keys} className="inline-flex items-center gap-1.5">
          {keys.split(" ").map((k) => (
            <kbd
              key={k}
              className="min-w-6 rounded-md border border-border/70 bg-background/70 px-1.5 py-0.5 text-center font-sans text-[11px] font-semibold text-foreground/80 shadow-[0_1px_0_rgba(0,0,0,0.08)]"
            >
              {k}
            </kbd>
          ))}
          {action}
        </span>
      ))}
    </p>
  );
}
