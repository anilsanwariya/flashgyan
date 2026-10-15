// Small pieces shared by the current affairs admin screens.
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

export function Badge({
  children,
  tone = "muted",
  title,
}: {
  children: React.ReactNode;
  tone?: "muted" | "primary" | "warn" | "good" | "bad";
  title?: string;
}) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/10 text-primary",
    warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    good: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    bad: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

// Ticks rows on and off, keeping only ids still in the list.
export function useChosen(ids: string[]) {
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const key = ids.join(",");
  useEffect(() => {
    const live = new Set(ids);
    setChosen((cur) => {
      const next = new Set([...cur].filter((id) => live.has(id)));
      return next.size === cur.size ? cur : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const toggle = (id: string, on: boolean) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  return { chosen, setChosen, toggle };
}

// "Select all", the number selected, and delete buttons for a list.
export function BulkBar({
  ids,
  chosen,
  setChosen,
  noun,
  busy,
  onDelete,
}: {
  ids: string[];
  chosen: Set<string>;
  setChosen: (s: Set<string>) => void;
  noun: string;
  busy: boolean;
  onDelete: (ids: string[], all: boolean) => void;
}) {
  const all = ids.length > 0 && ids.every((id) => chosen.has(id));
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <label className="inline-flex items-center gap-2">
        <Checkbox
          checked={all}
          onCheckedChange={(v) => setChosen(v === true ? new Set(ids) : new Set())}
          aria-label={`Select all ${noun}`}
        />
        Select all
      </label>
      {chosen.size > 0 && (
        <>
          <span className="text-muted-foreground">{chosen.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onDelete([...chosen], false)}
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete {chosen.size}
          </Button>
        </>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-7 text-destructive hover:text-destructive"
        disabled={busy || !ids.length}
        onClick={() => onDelete(ids, true)}
      >
        Delete all {noun}
      </Button>
    </div>
  );
}
