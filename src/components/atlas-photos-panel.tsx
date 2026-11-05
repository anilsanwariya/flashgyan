// Admin: photos for the atlas's places from Wikimedia Commons. Places with
// the most facts first; search Commons (or take a suggestion for a whole
// page) and choose a photo. Only freely licensed files are offered, and the
// credit students see comes from Commons itself.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  atlasPhotoQueue,
  searchAtlasPhotos,
  setAtlasPhoto,
  suggestAtlasPhotos,
} from "@/lib/atlas.functions";
import { atlasCat, placePath } from "@/lib/atlas";
import { errorText } from "@/components/ca-ui";

type Photo = Awaited<ReturnType<typeof searchAtlasPhotos>>[number];
type Row = Awaited<ReturnType<typeof atlasPhotoQueue>>["rows"][number];

export function AtlasPhotos() {
  const queueFn = useServerFn(atlasPhotoQueue);
  const suggestFn = useServerFn(suggestAtlasPhotos);
  const [f, setF] = useState({ search: "", missing: true, page: 0 });
  const q = useQuery({
    queryKey: ["atlasPhotoQueue", f],
    queryFn: () => queueFn({ data: f }),
    // The list stays while the next one loads (an open search isn't lost).
    placeholderData: (prev) => prev,
  });
  const [ideas, setIdeas] = useState<Record<string, Photo | null>>({});
  const [suggesting, setSuggesting] = useState(false);
  const rows = q.data?.rows ?? [];
  const suggest = async () => {
    setSuggesting(true);
    try {
      const want = rows.filter((r) => !r.photo && !(r.key in ideas));
      for (let i = 0; i < want.length; i += 10) {
        const got = await suggestFn({
          data: {
            places: want
              .slice(i, i + 10)
              .map((r) => ({ key: r.key, name: r.name, district: r.district })),
          },
        });
        setIdeas((x) => ({ ...x, ...got }));
      }
    } catch (e) {
      toast.error(errorText(e, "Wikimedia Commons couldn't be searched"));
    } finally {
      setSuggesting(false);
    }
  };
  return (
    <div className="space-y-3" data-atlas-photos>
      <p className="text-sm text-muted-foreground">
        Photos come from Wikimedia Commons and stay there: only public-domain, CC0, CC BY and CC
        BY-SA files are offered, and students see the author, the licence and a link to the file
        under each photo. {q.data && `${q.data.withPhoto} places have a photo.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search places"
          placeholder="Search places…"
          value={f.search}
          onChange={(e) => setF({ ...f, search: e.target.value, page: 0 })}
          className="w-56"
        />
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={f.missing}
            onChange={(e) => setF({ ...f, missing: e.target.checked, page: 0 })}
          />
          Without a photo only
        </label>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={suggesting || !rows.length}
          onClick={suggest}
          data-suggest-photos
        >
          {suggesting ? "Looking on Commons…" : "Suggest photos for this page"}
        </Button>
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <PhotoRow key={r.key} r={r} idea={ideas[r.key]} />
        ))}
      </ul>
      {q.data && q.data.total > (f.page + 1) * 30 && (
        <Button size="sm" variant="ghost" onClick={() => setF({ ...f, page: f.page + 1 })}>
          Next {Math.min(30, q.data.total - (f.page + 1) * 30)} places
        </Button>
      )}
      {f.page > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setF({ ...f, page: f.page - 1 })}>
          Previous
        </Button>
      )}
    </div>
  );
}

function PhotoRow({ r, idea }: { r: Row; idea: Photo | null | undefined }) {
  const qc = useQueryClient();
  const setFn = useServerFn(setAtlasPhoto);
  const searchFn = useServerFn(searchAtlasPhotos);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() =>
    `${(r.name.split(",")[0] ?? r.name).replace(/\([^)]*\)/g, "").trim()} ${r.district}`.trim(),
  );
  const [found, setFound] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (title: string | null) => {
    setBusy(true);
    try {
      await setFn({ data: { key: r.key, title } });
      toast.success(title ? "Photo chosen" : "Photo removed");
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["atlasPhotoQueue"] });
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setBusy(false);
    }
  };
  const search = async () => {
    setBusy(true);
    try {
      setFound(await searchFn({ data: { query } }));
    } catch (e) {
      toast.error(errorText(e, "Wikimedia Commons couldn't be searched"));
    } finally {
      setBusy(false);
    }
  };
  const shown = r.photo ?? idea ?? null;
  return (
    <li className="rounded-xl border border-border p-2.5" data-photo-row={r.key}>
      <div className="flex items-center gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
          {shown && (
            <img
              src={shown.thumb}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={`h-full w-full object-cover ${r.photo ? "" : "opacity-70"}`}
            />
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium">
            {atlasCat(r.cat).icon} {r.name}{" "}
            <span className="text-xs text-muted-foreground">
              · {r.district} · {r.facts} facts
            </span>
          </p>
          {shown && (
            <p className="truncate text-xs text-muted-foreground">
              {r.photo ? "Chosen: " : "Suggested: "}
              {shown.title.replace(/^File:/, "")} · {shown.author} · {shown.license}
            </p>
          )}
          {idea === null && !r.photo && (
            <p className="text-xs text-muted-foreground">Nothing free found on Commons.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {!r.photo && idea && (
            <Button size="sm" className="h-7" disabled={busy} onClick={() => choose(idea.title)}>
              Use this
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7" onClick={() => setOpen(!open)}>
            {open ? "Close" : "Find photos"}
          </Button>
          {r.photo && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={busy}
              onClick={() => choose(null)}
            >
              Remove
            </Button>
          )}
          <a
            href={placePath(r.key)}
            target="_blank"
            rel="noreferrer"
            className="self-center text-xs underline"
          >
            Open
          </a>
        </div>
      </div>
      {open && (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <Input
              aria-label="Search Wikimedia Commons"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" type="submit" disabled={busy || query.trim().length < 2}>
              {busy ? "…" : "Search Commons"}
            </Button>
          </form>
          {found && !found.length && (
            <p className="text-sm text-muted-foreground">
              No freely licensed photos found. Try other words (a nearby town, the Hindi name in
              English letters).
            </p>
          )}
          {found && found.length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {found.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  disabled={busy}
                  onClick={() => choose(p.title)}
                  className="overflow-hidden rounded-lg border border-border text-left hover:ring-2 hover:ring-primary"
                  data-commons-photo={p.title}
                >
                  <img
                    src={p.thumb}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="aspect-[3/2] w-full object-cover"
                  />
                  <span className="block truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                    {p.author} · {p.license}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
