// The atlas's drills (admin): the districts each river flows through
// (drafted from the river map, checked by the editor before students see
// them), the districts on each border, the tehsil table for "Districts then
// and now" (pasted, or read by SAATHI from pasted text), and the daily
// question posted to the Telegram channel.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Trash2, X } from "lucide-react";
import { atlasDrillsAdmin, editAtlasDrills, readAtlasTehsils } from "@/lib/atlas.functions";
import { BORDERS, findTehsil, type RiverPath } from "@/lib/atlas-drills";
import { Badge, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Data = Awaited<ReturnType<typeof atlasDrillsAdmin>>;

export function AtlasDrills() {
  const fn = useServerFn(atlasDrillsAdmin);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["atlasDrillsAdmin"],
    queryFn: () => fn(),
    refetchOnMount: "always",
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["atlasDrillsAdmin"] });
  if (q.isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (q.error) return <p className="text-destructive">{errorText(q.error, "Couldn't load")}</p>;
  const d = q.data!;
  return (
    <div className="space-y-5">
      <DailyPoll d={d} onDone={refresh} />
      <Rivers d={d} onDone={refresh} />
      <Borders d={d} onDone={refresh} />
      <Tehsils d={d} onDone={refresh} />
    </div>
  );
}

function DailyPoll({ d, onDone }: { d: Data; onDone: () => Promise<unknown> }) {
  const editFn = useServerFn(editAtlasDrills);
  const [hour, setHour] = useState(d.poll.hour);
  const [on, setOn] = useState(d.poll.on);
  const save = async (next: boolean, h = hour) => {
    setOn(next);
    try {
      await editFn({ data: { op: "poll", on: next, hour: h } });
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    }
  };
  return (
    <section className="space-y-2 rounded-xl border border-border p-4" data-daily-poll>
      <h3 className="font-semibold">Daily challenge on Telegram</h3>
      <p className="text-sm text-muted-foreground">
        Students get the same five map questions every day at /atlas/daily, with a streak. When this
        is on, the day's first “which district?” question is also posted to the channel (Magazine
        settings) as a quiz poll, with a link to the other four.
      </p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={on} onChange={(e) => save(e.target.checked)} />
          Post the daily question
        </label>
        <label className="flex items-center gap-2">
          at
          <select
            aria-label="Hour"
            value={hour}
            onChange={(e) => {
              setHour(Number(e.target.value));
              void save(on, Number(e.target.value));
            }}
            className="h-8 rounded-md border border-input bg-background px-2"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          India time
        </label>
        {d.poll.lastDay && <span className="text-muted-foreground">Last: {d.poll.lastDay}</span>}
      </div>
      {d.poll.error && <p className="text-sm text-destructive">Last time: {d.poll.error}</p>}
    </section>
  );
}

// ---------- Rivers ----------

function Rivers({ d, onDone }: { d: Data; onDone: () => Promise<unknown> }) {
  const checked = d.rivers.filter((r) => r.checked).length;
  return (
    <section className="space-y-2 rounded-xl border border-border p-4">
      <h3 className="font-semibold">
        River's path · {checked} of {d.rivers.length} checked
      </h3>
      <p className="text-sm text-muted-foreground">
        Students put the districts a river flows through in order, from its source. Each list is a
        draft from the river map (districts it only brushes are left out): check it against the
        notes, change it, and tick “Checked”. Only checked rivers with three or more districts are
        used.
      </p>
      <ul className="space-y-2">
        {d.rivers.map((r) => (
          <RiverRow key={r.key} r={r} all={d.districts} onDone={onDone} />
        ))}
      </ul>
    </section>
  );
}

function RiverRow({
  r,
  all,
  onDone,
}: {
  r: RiverPath;
  all: string[];
  onDone: () => Promise<unknown>;
}) {
  const editFn = useServerFn(editAtlasDrills);
  const [list, setList] = useState(r.districts);
  const [ok, setOk] = useState(r.checked);
  const dirty = ok !== r.checked || list.join() !== r.districts.join();
  const move = (i: number, by: number) => {
    const n = list.slice();
    [n[i], n[i + by]] = [n[i + by], n[i]];
    setList(n);
  };
  return (
    <li className="space-y-1.5 rounded-lg bg-muted/40 p-2 text-sm" data-river={r.key}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">
          {r.name.en} <span className="font-normal text-muted-foreground">{r.name.hi}</span>
        </span>
        {r.checked ? <Badge tone="good">checked</Badge> : <Badge tone="warn">draft</Badge>}
        <label className="ml-auto flex items-center gap-1.5">
          <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
          Checked
        </label>
        <Button
          size="sm"
          className="h-7"
          disabled={!dirty}
          onClick={async () => {
            try {
              await editFn({
                data: { op: "river", river: { ...r, districts: list, checked: ok } },
              });
              toast.success(`${r.name.en} saved`);
              await onDone();
            } catch (e) {
              toast.error(errorText(e, "Couldn't save"));
            }
          }}
        >
          Save
        </Button>
      </div>
      <ol className="flex flex-wrap items-center gap-1">
        {list.map((x, i) => (
          <li
            key={x}
            className="inline-flex items-center gap-0.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs"
          >
            {i + 1}. {x}
            <button
              type="button"
              aria-label={`${x} earlier`}
              disabled={!i}
              onClick={() => move(i, -1)}
            >
              <ArrowUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`${x} later`}
              disabled={i === list.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Remove ${x}`}
              onClick={() => setList(list.filter((y) => y !== x))}
            >
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
        <select
          aria-label={`Add a district to ${r.name.en}`}
          value=""
          onChange={(e) => e.target.value && setList([...list, e.target.value])}
          className="h-7 rounded-md border border-input bg-background px-1 text-xs"
        >
          <option value="">Add…</option>
          {all
            .filter((x) => !list.includes(x))
            .map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
        </select>
      </ol>
    </li>
  );
}

// ---------- Borders ----------

function Borders({ d, onDone }: { d: Data; onDone: () => Promise<unknown> }) {
  const editFn = useServerFn(editAtlasDrills);
  const [b, setB] = useState(d.borders);
  const dirty = JSON.stringify(b) !== JSON.stringify(d.borders);
  return (
    <section className="space-y-2 rounded-xl border border-border p-4" data-borders>
      <div className="flex items-center gap-2">
        <h3 className="font-semibold">Borders</h3>
        <Button
          size="sm"
          className="ml-auto"
          disabled={!dirty}
          onClick={async () => {
            try {
              await editFn({ data: { op: "borders", borders: b } });
              toast.success("Borders saved");
              await onDone();
            } catch (e) {
              toast.error(errorText(e, "Couldn't save"));
            }
          }}
        >
          Save borders
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Students tap every district on a border. The lists start from the notes' “Inter-state
        borders” and the international border.
      </p>
      {BORDERS.map((x) => (
        <div key={x.key} className="text-sm">
          <p className="font-medium">
            {x.name.en} ({(b[x.key] ?? []).length})
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {(b[x.key] ?? []).map((dist) => (
              <span
                key={dist}
                className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
              >
                {dist}
                <button
                  type="button"
                  aria-label={`Remove ${dist} from ${x.name.en}`}
                  onClick={() => setB({ ...b, [x.key]: b[x.key].filter((y) => y !== dist) })}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <select
              aria-label={`Add a district to ${x.name.en}`}
              value=""
              onChange={(e) =>
                e.target.value && setB({ ...b, [x.key]: [...(b[x.key] ?? []), e.target.value] })
              }
              className="h-7 rounded-md border border-input bg-background px-1 text-xs"
            >
              <option value="">Add…</option>
              {d.districts
                .filter((y) => !(b[x.key] ?? []).includes(y))
                .map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
            </select>
          </div>
        </div>
      ))}
    </section>
  );
}

// ---------- Tehsils then and now ----------

function Tehsils({ d, onDone }: { d: Data; onDone: () => Promise<unknown> }) {
  const editFn = useServerFn(editAtlasDrills);
  const readFn = useServerFn(readAtlasTehsils);
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const shown = find.trim() ? findTehsil(d.tehsils, find) : d.tehsils.slice(0, 50);
  const save = async (replace: boolean) => {
    if (replace && !confirm(`Replace all ${d.tehsils.length} rows with these?`)) return;
    setBusy(replace ? "replace" : "add");
    try {
      const r = await editFn({ data: { op: "tehsils", text, replace } });
      setProblems(r.problems);
      if (r.saved) {
        toast.success(`${r.saved} rows saved`);
        if (!r.problems.length) setText("");
      } else toast.error("No rows saved: see the problems");
      await onDone();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="space-y-2 rounded-xl border border-border p-4" data-tehsil-table>
      <h3 className="font-semibold">Districts then and now · {d.tehsils.length} tehsils</h3>
      <p className="text-sm text-muted-foreground">
        Students look a tehsil up at /atlas/then-now and see its district in the 33-district map,
        the 50-district map (Aug 2023) and today's 41. Paste a table, one tehsil a line:{" "}
        <code>Tehsil / हिंदी | 33-map district | 50-map district | today's district</code> (commas
        or tabs work too). Or paste a notification or your notes and let SAATHI make the table, then
        check it here before saving.
      </p>
      <Textarea
        aria-label="Tehsil table"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          "Dudu / दूदू | Jaipur | Dudu | Jaipur\nSanchore / सांचौर | Jalore | Sanchore | Jalore"
        }
        className="font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!text.trim() || !!busy} onClick={() => save(false)}>
          {busy === "add" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Add these rows
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!text.trim() || !!busy}
          onClick={() => save(true)}
        >
          Replace the table
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={text.trim().length < 20 || !!busy}
          onClick={async () => {
            setBusy("read");
            try {
              const r = await readFn({ data: { text } });
              setText(r.text);
              setProblems(r.problems);
              toast.success(`SAATHI found ${r.rows} tehsils: check them, then save`);
            } catch (e) {
              toast.error(errorText(e, "SAATHI couldn't read it"));
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "read" && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
          Read with SAATHI
        </Button>
      </div>
      {problems.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-sm text-destructive" data-tehsil-problems>
          {problems.slice(0, 20).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {d.tehsils.length > 0 && (
        <>
          <Input
            aria-label="Find a tehsil"
            placeholder="Find a tehsil…"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            className="h-8 max-w-xs"
          />
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1">Tehsil</th>
                <th>33</th>
                <th>50</th>
                <th>Today</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.tehsil.en}
                  className="border-t border-border"
                  data-tehsil-row={r.tehsil.en}
                >
                  <td className="py-1">
                    {r.tehsil.en} <span className="text-muted-foreground">{r.tehsil.hi}</span>
                  </td>
                  <td>{r.d33}</td>
                  <td className={r.d50 !== r.d33 ? "font-semibold" : ""}>{r.d50}</td>
                  <td className={r.d41 !== r.d50 ? "font-semibold" : ""}>{r.d41}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      aria-label={`Delete ${r.tehsil.en}`}
                      onClick={async () => {
                        await editFn({ data: { op: "deleteTehsil", en: r.tehsil.en } });
                        await onDone();
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
