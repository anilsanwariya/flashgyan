// Small pieces shared by the current affairs admin screens.
import { useEffect, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// A server check that failed arrives as a list of problems in JSON: shown as
// a sentence ("Invalid url (content › Fact Bite 1 › url)").
export const errorText = (e: unknown, fallback: string) => {
  if (!(e instanceof Error)) return fallback;
  try {
    const issues = JSON.parse(e.message) as { message?: string; path?: (string | number)[] }[];
    if (Array.isArray(issues) && issues[0]?.message) {
      const { message, path = [] } = issues[0];
      const where = path
        .map((p) => (typeof p === "number" ? String(p + 1) : p === "dyk" ? "Fact Bite" : p))
        .join(" › ");
      return where ? `${message} (${where})` : message;
    }
  } catch {
    // not JSON: the message as it is
  }
  return e.message;
};

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
  actions,
}: {
  ids: string[];
  chosen: Set<string>;
  setChosen: (s: Set<string>) => void;
  noun: string;
  busy: boolean;
  onDelete: (ids: string[], all: boolean) => void;
  // More for the chosen ones, beside Delete.
  actions?: React.ReactNode;
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
          {actions}
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
      {/* Deleting everything is kept a step away, in a menu. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 w-7 p-0"
            disabled={busy || !ids.length}
            aria-label={`More for all ${noun}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(ids, true)}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete all {noun}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// A page's tabs: one row that scrolls sideways on phones. The open tab is
// kept in the address (?tab=…), so a link can open it.
export function useUrlTab<T extends string>(tabs: readonly T[], fallback: T): [T, (t: T) => void] {
  const navigate = useNavigate();
  const [tab, setTab] = useState<T>(fallback);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && (tabs as readonly string[]).includes(t)) setTab(t as T);
    // The tabs are fixed for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const choose = (t: T) => {
    setTab(t);
    void navigate({
      to: ".",
      search: (s: Record<string, unknown>) => ({ ...s, tab: t }),
      replace: true,
    } as never);
  };
  return [tab, choose];
}

export function PageTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: readonly { id: T; label: string; dot?: boolean }[];
  value: T;
  onChange: (t: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1 [scrollbar-width:none]"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${value === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          {t.label}
          {t.dot && (
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-500"
              aria-label="has changes that aren't saved"
            />
          )}
        </button>
      ))}
    </div>
  );
}

// For cards whose changes save at once, unlike the form's Save button.
export function SavesInstantly() {
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
      Saves instantly
    </span>
  );
}
