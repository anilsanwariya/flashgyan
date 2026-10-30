// Admin: events that run over several days (the Olympics, a COP summit, an
// international fair). The AI names a story's event while reading the
// sources; here the editor fixes its mistakes: renames, dates, concluded or
// running, merging two events, unlinking stories, and the complete summary
// that prints in the monthly issue of the month the event ended.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import {
  type EventWithStories,
  createCaEvent,
  deleteCaEvent,
  linkCaStoryEvent,
  listCaEvents,
  mergeCaEvents,
  updateCaEvent,
  writeCaEventSummary,
} from "@/lib/current-affairs.functions";
import { EVENT_KINDS, summaryMonth, type CaEvent, type EventKind } from "@/lib/ca-events";
import { formatDate, type CaContent } from "@/lib/current-affairs";
import { Badge, errorText, SavesInstantly } from "@/components/ca-ui";
import { MedalBox } from "@/components/ca-medals-panel";
import { EventSummaryEditor } from "@/components/ca-event-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Patch = Partial<
  Pick<CaEvent, "name" | "name_hi" | "kind" | "place" | "starts_on" | "ends_on" | "status">
> & { summary?: CaContent | null };

const FILTERS = [
  { id: "running", label: "Running" },
  { id: "concluded", label: "Concluded" },
  { id: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

export function EventsPanel({ month }: { month: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCaEvents);
  const createFn = useServerFn(createCaEvent);
  const q = useQuery({ queryKey: ["caEvents"], queryFn: () => listFn() });
  const [filter, setFilter] = useState<Filter>("all");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<EventKind>("sports");
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["caEvents"] }),
      qc.invalidateQueries({ queryKey: ["caMonth"] }),
      qc.invalidateQueries({ queryKey: ["caDay"] }),
    ]);

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading events…</p>;
  if (q.error)
    return <p className="text-sm text-destructive">{errorText(q.error, "Couldn't load events")}</p>;
  if (q.data && !q.data.ready)
    return (
      <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
        Events need a database update: run the latest migration (ca_events) in Lovable or the SQL
        editor, then reload this page.
      </p>
    );
  const all = q.data?.events ?? [];
  const shown = all.filter((e) => filter === "all" || e.status === filter);

  async function add() {
    if (name.trim().length < 3) return;
    try {
      const { id } = await createFn({ data: { name: name.trim(), kind } });
      setName("");
      setOpen(id);
      toast.success("Event added");
      await refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't add the event"));
    }
  }

  return (
    <section aria-label="Events" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">Events</h3>
          <SavesInstantly />
        </div>
        <p className="text-sm text-muted-foreground">
          Events that run over several days. The AI links each story to its event; the day's stories
          of one event become one roundup. When an event concludes, its complete summary prints in
          the “Events of the month” section of that month's issue, in place of its daily stories. A
          running event's stories print together with a “continues next month” note.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show events" className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              size="sm"
              variant={filter === f.id ? "default" : "outline"}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label} ({all.filter((e) => f.id === "all" || e.status === f.id).length})
            </Button>
          ))}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <Input
            aria-label="New event name"
            placeholder="New event, e.g. Asian Games 2026"
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            className="h-9 w-64 max-w-full"
          />
          <select
            aria-label="New event kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as EventKind)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {EVENT_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <Button size="sm" disabled={name.trim().length < 3} onClick={() => void add()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>

      {shown.length ? (
        <ul className="space-y-2" data-testid="events">
          {shown.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              others={all.filter((o) => o.id !== e.id)}
              month={month}
              open={open === e.id}
              onToggle={() => setOpen(open === e.id ? null : e.id)}
              onChanged={refresh}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {all.length ? "No events here." : "No events yet. They appear as the AI finds them."}
        </p>
      )}
    </section>
  );
}

const monthLabel = (m: string) => formatDate(m, "en", false);

function EventCard({
  event: e,
  others,
  month,
  open,
  onToggle,
  onChanged,
}: {
  event: EventWithStories;
  others: EventWithStories[];
  month: string;
  open: boolean;
  onToggle: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const updateFn = useServerFn(updateCaEvent);
  const mergeFn = useServerFn(mergeCaEvents);
  const deleteFn = useServerFn(deleteCaEvent);
  const linkFn = useServerFn(linkCaStoryEvent);
  const writeFn = useServerFn(writeCaEventSummary);
  const [busy, setBusy] = useState("");
  const prints = summaryMonth(e);
  const dates = e.stories.map((s) => s.issue_date);
  const first = e.starts_on ?? dates[0];
  const last = e.ends_on ?? dates[dates.length - 1];

  async function run(label: string, fn: () => Promise<unknown>, done = "") {
    setBusy(label);
    try {
      await fn();
      if (done) toast.success(done);
      await onChanged();
    } catch (err) {
      toast.error(errorText(err, "Something went wrong"));
    } finally {
      setBusy("");
    }
  }
  const save = (patch: Patch, done = "") =>
    run("save", () => updateFn({ data: { id: e.id, patch } }), done);

  return (
    <li data-event={e.name} className="rounded-xl border border-border">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-2 p-3 text-left"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="font-medium">{e.name}</span>
        {e.name_hi && <span className="text-sm text-muted-foreground">{e.name_hi}</span>}
        <Badge tone={e.status === "running" ? "primary" : "good"}>
          {e.status === "running" ? "Running" : "Concluded"}
        </Badge>
        <Badge>
          {e.stories.length} {e.stories.length === 1 ? "story" : "stories"}
        </Badge>
        {e.status === "concluded" &&
          (e.summary ? (
            <Badge tone="good">Summary written</Badge>
          ) : (
            <Badge tone="warn">Needs summary</Badge>
          ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {first ? formatDate(first, "en") : ""}
          {last && last !== first ? ` – ${formatDate(last, "en")}` : ""}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border p-3">
          {/* Remounted when the event changes, so the fields show what's saved. */}
          <div key={e.updated_at} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Name (English)">
              <Input
                aria-label="Event name"
                defaultValue={e.name}
                maxLength={120}
                onBlur={(ev) => {
                  const v = ev.target.value.trim();
                  if (v.length >= 3 && v !== e.name) void save({ name: v }, "Renamed");
                }}
              />
            </Field>
            <Field label="Name (Hindi)">
              <Input
                aria-label="Event name in Hindi"
                defaultValue={e.name_hi}
                maxLength={120}
                onBlur={(ev) => {
                  const v = ev.target.value.trim();
                  if (v !== e.name_hi) void save({ name_hi: v }, "Hindi name saved");
                }}
              />
            </Field>
            <Field label="Kind">
              <select
                aria-label="Event kind"
                value={e.kind}
                onChange={(ev) => void save({ kind: ev.target.value as EventKind })}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                {EVENT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Place">
              <Input
                aria-label="Event place"
                defaultValue={e.place}
                maxLength={120}
                onBlur={(ev) => {
                  const v = ev.target.value.trim();
                  if (v !== e.place) void save({ place: v }, "Place saved");
                }}
              />
            </Field>
            <Field label="Started">
              <Input
                type="date"
                aria-label="Event start date"
                defaultValue={e.starts_on ?? ""}
                onBlur={(ev) => {
                  const v = ev.target.value || null;
                  if (v !== e.starts_on) void save({ starts_on: v }, "Start date saved");
                }}
              />
            </Field>
            <Field label="Concluded on">
              <Input
                type="date"
                aria-label="Event end date"
                defaultValue={e.ends_on ?? ""}
                onBlur={(ev) => {
                  const v = ev.target.value || null;
                  if (v === e.ends_on) return;
                  void save(
                    v ? { ends_on: v, status: "concluded" } : { ends_on: null, status: "running" },
                    v ? "Marked concluded" : "Marked running",
                  );
                }}
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {e.status === "running" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void save({ status: "concluded" }, "Marked concluded")}
              >
                Mark concluded
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={!!busy}
                onClick={() => void save({ status: "running" }, "Marked running")}
              >
                Still running
              </Button>
            )}
            {others.length > 0 && (
              <select
                aria-label={`Merge ${e.name} into`}
                value=""
                disabled={!!busy}
                onChange={(ev) => {
                  const into = others.find((o) => o.id === ev.target.value);
                  if (
                    into &&
                    confirm(`Move this event's stories to “${into.name}” and remove “${e.name}”?`)
                  )
                    void run(
                      "merge",
                      () => mergeFn({ data: { from: e.id, into: into.id } }),
                      "Events merged",
                    );
                }}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Same as another event…</option>
                {others.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${e.name}`}
              disabled={!!busy}
              onClick={() => {
                if (confirm(`Remove “${e.name}”? Its stories stay, without an event.`))
                  void run("delete", () => deleteFn({ data: { id: e.id } }), "Event removed");
              }}
            >
              <Trash2 className="h-4 w-4" /> Not an event
            </Button>
            <span className="text-muted-foreground">
              {prints
                ? `Its summary prints in the ${monthLabel(prints)} issue${prints === month ? " (this month)" : ""}.`
                : "Its stories print together; the summary comes when it concludes."}
            </span>
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold">Stories</h4>
            {e.stories.length ? (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {e.stories.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-2 py-1.5">
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">
                      {formatDate(s.issue_date, "en")}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{s.headline}</span>
                    {s.status !== "included" && <Badge>{s.status}</Badge>}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      aria-label={`Unlink ${s.headline}`}
                      onClick={() =>
                        void run(
                          "unlink",
                          () => linkFn({ data: { itemId: s.id, eventId: null } }),
                          "Story unlinked",
                        )
                      }
                    >
                      Unlink
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No stories linked. Link one from its story page.
              </p>
            )}
          </div>

          <SummaryBox
            event={e}
            busy={busy}
            onWrite={() =>
              run(
                "write",
                () => writeFn({ data: { id: e.id } }),
                e.summary ? "Summary written again" : "Summary written",
              )
            }
            onChanged={onChanged}
          />
          {e.kind === "sports" && <MedalBox eventId={e.id} eventName={e.name} />}
        </div>
      )}
    </li>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

// The complete summary: written by the AI from all the event's stories, and
// edited in its own full-screen editor like a daily story.
function SummaryBox({
  event: e,
  busy,
  onWrite,
  onChanged,
}: {
  event: EventWithStories;
  busy: string;
  onWrite: () => Promise<unknown>;
  onChanged: () => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const s = e.summary;
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">Complete summary</h4>
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy || !e.stories.length}
          onClick={() => void onWrite()}
        >
          {busy === "write" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {busy === "write" ? "Writing…" : s ? "Write again" : "Write summary"}
        </Button>
        {s && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" /> Open editor
          </Button>
        )}
      </div>
      {!s ? (
        <p className="text-sm text-muted-foreground">
          {e.status === "concluded"
            ? "Not written yet. The evening collection writes it, or write it now."
            : "Written when the event concludes (or now, to see it)."}
        </p>
      ) : (
        <div className="grid gap-3 text-sm md:grid-cols-2" data-testid="event-summary">
          {(["hi", "en"] as const).map((l) => (
            <div key={l} lang={l} className="space-y-1">
              <div className="font-semibold">{s.headline[l]}</div>
              {!s.hide_summary && <p>{s.summary[l]}</p>}
              <ul className="list-disc pl-5">
                {s.points.map((p, i) => (
                  <li key={i}>{p[l]}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {editing && s && (
        <EventSummaryEditor event={e} onClose={() => setEditing(false)} onChanged={onChanged} />
      )}
    </div>
  );
}
