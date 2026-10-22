// Admin: a custom magazine's finishing touches. Material of its own (files,
// links, text) read into stories, the websites it collects its dates from,
// a background article after a section from SAATHI's knowledge base, and
// posting it to Telegram.
import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookOpen,
  CalendarClock,
  FileUp,
  Globe,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
} from "lucide-react";
import {
  addCaMagMaterial,
  collectCaMagSites,
  deleteCaMagMaterial,
  listCaMagMaterials,
  postCaMag,
  removeCaMagFeature,
  setCaMagSites,
  writeCaMagFeature,
} from "@/lib/ca-mags.functions";
import { getCaBackfill, saveCaWatchSite } from "@/lib/ca-collect.functions";
import type { CustomMag, MagSection } from "@/lib/ca-mags";
import { formatDate } from "@/lib/current-affairs";
import { PastCollection } from "@/components/ca-past-collection";
import { Badge, SavesInstantly, errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

// Material parts still to read (the page's progress line and refresh).
export function useMagMaterials(id: string) {
  const listFn = useServerFn(listCaMagMaterials);
  const q = useQuery({
    queryKey: ["caMagMaterials", id],
    queryFn: () => listFn({ data: { id } }),
    refetchInterval: (query) =>
      (query.state.data?.list ?? []).some((m) => m.chunks_done < m.chunks && !m.error)
        ? 20_000
        : false,
  });
  const list = q.data?.list ?? [];
  const reading = list
    .filter((m) => !m.error)
    .reduce((n, m) => n + Math.max(0, m.chunks - m.chunks_done), 0);
  return { q, list, reading, ready: q.data?.ready ?? true };
}

// ---------- Telegram ----------

export function PostButtons({ mag, onPosted }: { mag: CustomMag; onPosted: () => unknown }) {
  const postFn = useServerFn(postCaMag);
  const [busy, setBusy] = useState<"test" | "post" | null>(null);
  async function post(test: boolean) {
    if (
      !test &&
      !confirm(
        `Post “${mag.title_en}” (English and Hindi PDFs) to the channel now?${mag.posted_at ? " It was posted before; this posts it again." : ""}`,
      )
    )
      return;
    setBusy(test ? "test" : "post");
    try {
      await postFn({ data: { id: mag.id, test } });
      toast.success(test ? "Sent to your test chat" : "Posted to the channel");
    } catch (e) {
      toast.error(errorText(e, "Couldn't send it"));
    } finally {
      setBusy(null);
      await onPosted();
    }
  }
  const noPdf = !mag.pdf_url_en;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="mag-post">
      <Button
        size="sm"
        variant="outline"
        disabled={!!busy || noPdf}
        title={noPdf ? "Make the PDFs first" : undefined}
        onClick={() => void post(true)}
      >
        <Send className="mr-1 h-4 w-4" /> {busy === "test" ? "Sending…" : "Send test to me"}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!!busy || noPdf}
        title={noPdf ? "Make the PDFs first" : undefined}
        onClick={() => void post(false)}
      >
        <Send className="mr-1 h-4 w-4" /> {busy === "post" ? "Posting…" : "Post to channel"}
      </Button>
      {mag.posted_at && (
        <span className="text-xs text-muted-foreground">Posted {when(mag.posted_at)}</span>
      )}
      {mag.post_error && (
        <span className="text-xs text-destructive">Last post failed: {mag.post_error}</span>
      )}
    </div>
  );
}

// ---------- A section's background article ----------

export function SectionFeature({
  mag,
  section,
  onChanged,
}: {
  mag: CustomMag;
  section: MagSection;
  onChanged: () => Promise<unknown>;
}) {
  const writeFn = useServerFn(writeCaMagFeature);
  const removeFn = useServerFn(removeCaMagFeature);
  const [busy, setBusy] = useState<"write" | "remove" | null>(null);
  const [open, setOpen] = useState(false);
  const feature = mag.features?.[section.id] ?? null;

  async function write() {
    setBusy("write");
    try {
      await writeFn({ data: { id: mag.id, section: section.id } });
      toast.success(`Background article for ${section.en} written`);
      setOpen(true);
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't write it"));
    } finally {
      setBusy(null);
    }
  }
  async function remove() {
    if (!confirm(`Remove the background article after ${section.en}?`)) return;
    setBusy("remove");
    try {
      await removeFn({ data: { id: mag.id, section: section.id } });
      toast.success("Background article removed");
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove it"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3" data-feature>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <BookOpen className="h-4 w-4 text-primary" />
        {feature ? (
          <button
            type="button"
            className="min-w-0 flex-1 text-left font-medium hover:underline"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            Background article: {feature.title.en || feature.title.hi}
          </button>
        ) : (
          <span className="min-w-0 flex-1 text-muted-foreground">
            A background article after this section, from SAATHI's books
          </span>
        )}
        {busy === "write" ? (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing… (about a minute)
          </span>
        ) : (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void write()}>
            {feature ? (
              <>
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Write again
              </>
            ) : (
              <>
                <Plus className="mr-1 h-3.5 w-3.5" /> Write background article
              </>
            )}
          </Button>
        )}
        {feature && (
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Remove background article after ${section.en}`}
            disabled={!!busy}
            onClick={() => void remove()}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {feature && open && (
        <article className="space-y-2 text-sm">
          <p className="font-semibold">{feature.title.en}</p>
          <p className="font-semibold">{feature.title.hi}</p>
          <p className="italic">{feature.intro.en}</p>
          {feature.sections.map((s, i) => (
            <div key={i}>
              <p className="font-medium text-primary">{s.heading.en}</p>
              <p className="whitespace-pre-line">{s.body.en}</p>
            </div>
          ))}
          {feature.sources.length > 0 && (
            <p className="text-xs text-muted-foreground">
              From your notes: {feature.sources.join(", ")}
            </p>
          )}
        </article>
      )}
    </div>
  );
}

// ---------- Material and websites ----------

type Kind = "file" | "link" | "text";

export function MaterialTab({ mag, onChanged }: { mag: CustomMag; onChanged: () => unknown }) {
  return (
    <div className="space-y-4">
      <MaterialBox mag={mag} onChanged={onChanged} />
      <SitesBox mag={mag} onChanged={onChanged} />
    </div>
  );
}

function MaterialBox({ mag, onChanged }: { mag: CustomMag; onChanged: () => unknown }) {
  const qc = useQueryClient();
  const addFn = useServerFn(addCaMagMaterial);
  const deleteFn = useServerFn(deleteCaMagMaterial);
  const { q, list, ready } = useMagMaterials(mag.id);
  const [kind, setKind] = useState<Kind>("file");
  const [files, setFiles] = useState<File[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["caMagMaterials", mag.id] });
    await onChanged();
  };
  const dateIn = date && date >= mag.date_from && date <= mag.date_to ? date : null;

  async function add() {
    setBusy("add");
    try {
      if (kind === "file") {
        const { extractTextFromFile } = await import("@/lib/saathi-parse");
        let done = 0;
        for (const f of files) {
          setBusy(`Reading ${f.name}…`);
          const content = (await extractTextFromFile(f, "Bilingual")).trim();
          if (content.length < 40) {
            toast.error(`No readable text in ${f.name}`);
            continue;
          }
          await addFn({
            data: {
              id: mag.id,
              title: f.name.replace(/\.[a-z0-9]+$/i, ""),
              source_name: "Upload",
              content,
              date: dateIn,
            },
          });
          done++;
        }
        if (done) toast.success(`${done === 1 ? "File" : `${done} files`} added: reading it now`);
        setFiles([]);
        if (input.current) input.current.value = "";
      } else if (kind === "link") {
        await addFn({
          data: { id: mag.id, title: title.trim(), source_name: "", url: url.trim(), date: dateIn },
        });
        toast.success("Page added: reading it now");
        setUrl("");
        setTitle("");
      } else {
        await addFn({
          data: {
            id: mag.id,
            title: title.trim() || "Notes",
            source_name: "Notes",
            content: text.trim(),
            date: dateIn,
          },
        });
        toast.success("Text added: reading it now");
        setText("");
        setTitle("");
      }
      setDate("");
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    } finally {
      setBusy("");
      await refresh();
    }
  }

  async function remove(source: string, name: string) {
    if (!confirm(`Remove “${name}” and the stories made only from it?`)) return;
    try {
      await deleteFn({ data: { id: mag.id, source } });
      toast.success("Material removed");
    } catch (e) {
      toast.error(errorText(e, "Couldn't remove it"));
    } finally {
      await refresh();
    }
  }

  const canAdd =
    kind === "file"
      ? files.length > 0
      : kind === "link"
        ? /^https?:\/\/\S+$/.test(url.trim())
        : text.trim().length >= 40;

  return (
    <section
      aria-label="Material"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div>
        <h3 className="flex items-center gap-2 font-semibold">
          <FileUp className="h-4 w-4" /> Material for this magazine
        </h3>
        <p className="text-sm text-muted-foreground">
          Reports, yearbook chapters, notes or web pages. The AI reads them into stories, sorts them
          into the sections and writes them like the others. They stay in this magazine only; no
          daily page shows them.
        </p>
      </div>
      {!ready ? (
        <p className="rounded-xl border border-amber-400/60 bg-amber-500/10 p-3 text-sm">
          This needs a database update: run the latest migration (ca_mag_finishing) in Lovable or
          the SQL editor, then reload this page.
        </p>
      ) : (
        <>
          <div role="radiogroup" aria-label="Material kind" className="flex flex-wrap gap-1.5">
            {(
              [
                ["file", "Files"],
                ["link", "A web page"],
                ["text", "Paste text"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-full border px-3 py-1 text-xs ${kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "file" && (
            <div className="space-y-1">
              <Input
                ref={input}
                type="file"
                multiple
                aria-label="Material files"
                accept=".pdf,.docx,.xlsx,.xls,.txt,.md"
                onChange={(e) => setFiles([...(e.target.files ?? [])])}
              />
              <p className="text-xs text-muted-foreground">PDF, Word, Excel or text files.</p>
            </div>
          )}
          {kind === "link" && (
            <Input
              aria-label="Page address"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          )}
          {kind !== "file" && (
            <Input
              aria-label="Material title"
              placeholder={kind === "link" ? "Title (optional: the page's own)" : "Title"}
              maxLength={300}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}
          {kind === "text" && (
            <Textarea
              aria-label="Material text"
              rows={6}
              placeholder="Paste the text here"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span className="block">Date it's about (optional)</span>
              <Input
                type="date"
                aria-label="Material date"
                min={mag.date_from}
                max={mag.date_to}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-44"
              />
            </label>
            <Button disabled={!!busy || !canAdd} onClick={() => void add()}>
              <Plus className="mr-1 h-4 w-4" />
              {busy ? (busy === "add" ? "Adding…" : busy) : "Add material"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Without a date, stories are dated {formatDate(mag.date_to, "en")} (the magazine's last
            day).
          </p>

          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : list.length ? (
            <ul
              className="divide-y divide-border rounded-xl border border-border"
              data-testid="materials"
            >
              {list.map((m) => {
                const reading = !m.error && m.chunks_done < m.chunks;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-medium">{m.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.source_name} · {formatDate(m.mag_date, "en")} · {m.stories}{" "}
                        {m.stories === 1 ? "story" : "stories"}
                      </div>
                      {m.error && <div className="text-xs text-destructive">{m.error}</div>}
                    </div>
                    {reading ? (
                      <Badge tone="primary">
                        Reading {m.chunks_done} of {m.chunks}
                      </Badge>
                    ) : m.error ? (
                      <Badge tone="bad">Problem</Badge>
                    ) : (
                      <Badge tone="good">Read</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${m.title}`}
                      onClick={() => void remove(m.id, m.title)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No material yet.</p>
          )}
        </>
      )}
    </section>
  );
}

function SitesBox({ mag, onChanged }: { mag: CustomMag; onChanged: () => unknown }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getCaBackfill);
  const sitesFn = useServerFn(setCaMagSites);
  const collectFn = useServerFn(collectCaMagSites);
  const addSiteFn = useServerFn(saveCaWatchSite);
  const q = useQuery({ queryKey: ["caBackfill"], queryFn: () => getFn() });
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState("");
  const all = q.data?.sites ?? [];
  const chosen = picked ?? new Set(mag.site_ids ?? []);
  const bf = q.data?.backfill ?? null;
  const active = !!bf && (bf.status === "running" || bf.status === "paused");

  async function save(next: Set<string>) {
    setPicked(next);
    try {
      await sitesFn({ data: { id: mag.id, sites: [...next] } });
      await onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
      setPicked(null);
    }
  }

  async function addSite(e: React.FormEvent) {
    e.preventDefault();
    setBusy("site");
    try {
      const address = url.trim();
      await addSiteFn({
        data: {
          url: address,
          name: name.trim(),
          section: "news",
          language: "Bilingual",
          max_articles: 10,
          // Only for the magazines that pick it, until switched on in Settings.
          enabled: false,
        },
      });
      const fresh = await getFn();
      qc.setQueryData(["caBackfill"], fresh);
      const site =
        fresh.sites.find((s) => s.url === address) ??
        fresh.sites.find((s) => s.name === name.trim());
      if (site) await save(new Set([...chosen, site.id]));
      toast.success("Website added");
      setName("");
      setUrl("");
      setAdding(false);
    } catch (e) {
      toast.error(errorText(e, "Couldn't add it"));
    } finally {
      setBusy("");
    }
  }

  async function collect() {
    setBusy("collect");
    try {
      await collectFn({ data: { id: mag.id } });
      toast.success("Collecting the magazine's dates from these websites");
      await qc.invalidateQueries({ queryKey: ["caBackfill"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't start"));
    } finally {
      setBusy("");
    }
  }

  return (
    <section
      aria-label="Websites"
      className="space-y-3 rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <Globe className="h-4 w-4" /> Websites for this magazine
          </h3>
          <p className="text-sm text-muted-foreground">
            Collects {formatDate(mag.date_from, "en")} – {formatDate(mag.date_to, "en")} from the
            websites you pick (your daily ones, or new ones just for this). Their stories file under
            their real dates and come into this magazine.
          </p>
        </div>
        <SavesInstantly />
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" data-testid="mag-sites">
            {all.map((s) => (
              <label
                key={s.id}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${chosen.has(s.id) ? "border-primary/50 bg-primary/10" : "border-border text-muted-foreground"}`}
              >
                <Checkbox
                  checked={chosen.has(s.id)}
                  aria-label={s.name}
                  onCheckedChange={(on) => {
                    const next = new Set(chosen);
                    if (on === true) next.add(s.id);
                    else next.delete(s.id);
                    void save(next);
                  }}
                />
                {s.name}
                {!s.enabled && <span className="text-[10px] opacity-70">(not daily)</span>}
              </label>
            ))}
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setAdding((a) => !a)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> New website
            </Button>
          </div>
          {adding && (
            <form onSubmit={addSite} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label="Website name"
                placeholder="Name"
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 w-40"
              />
              <Input
                aria-label="Website address"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="h-9 min-w-0 flex-1"
              />
              <Button
                size="sm"
                type="submit"
                disabled={busy === "site" || !name.trim() || !url.trim()}
              >
                {busy === "site" ? "Adding…" : "Add"}
              </Button>
              <p className="w-full text-xs text-muted-foreground">
                Added switched off for the daily collection; turn it on in Magazine settings →
                Websites to watch if you want it daily too.
              </p>
            </form>
          )}
          {!active && (
            <Button disabled={!!busy || !chosen.size} onClick={() => void collect()}>
              <CalendarClock className="mr-1 h-4 w-4" />
              {busy === "collect" ? "Starting…" : "Collect the magazine's dates"}
            </Button>
          )}
          {active && <PastCollection />}
        </>
      )}
    </section>
  );
}
