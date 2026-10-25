// A story's map: suggested by SAATHI from the story's facts (its places put
// where the place list says they are), edited like the notes' maps, drawn
// as the issue prints it. Saved as you go.
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Sparkles } from "lucide-react";
import { suggestCaMap, type CaItem } from "@/lib/current-affairs.functions";
import { previewMap } from "@/lib/geo.functions";
import { uncheckedPlaces, type MapSpec } from "@/lib/map-spec";
import type { CaContent } from "@/lib/current-affairs";
import { MapEdit } from "@/components/map-edit";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";

export function StoryMap({
  item,
  content,
  lang,
  onSave,
}: {
  item: CaItem;
  content: CaContent;
  lang: "hi" | "en" | "both";
  onSave: (patch: Partial<CaContent>) => Promise<void>;
}) {
  const suggestFn = useServerFn(suggestCaMap);
  const previewFn = useServerFn(previewMap);
  const [m, setM] = useState<MapSpec | null>(content.map ?? null);
  const [busy, setBusy] = useState(false);
  const sent = useRef(JSON.stringify(content.map ?? null));
  // Saved once typing pauses.
  useEffect(() => {
    const json = JSON.stringify(m);
    if (json === sent.current) return;
    const t = setTimeout(() => {
      sent.current = json;
      onSave({ map: m }).catch((e) => toast.error(errorText(e, "Couldn't save the map")));
    }, 800);
    return () => clearTimeout(t);
  }, [m, onSave]);
  const [shown, setShown] = useState(m);
  useEffect(() => {
    const t = setTimeout(() => setShown(m), 500);
    return () => clearTimeout(t);
  }, [m]);
  const view = lang === "en" ? "en" : "hi";
  const preview = useQuery({
    queryKey: ["storyMapPreview", item.id, JSON.stringify(shown), view],
    queryFn: () => previewFn({ data: { map: shown as never, lang: view, review: true } }),
    enabled: !!shown,
    placeholderData: (p) => p,
  });
  const left = uncheckedPlaces(m);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant={m ? "outline" : "default"}
          disabled={busy}
          onClick={async () => {
            if (m?.places.length && !confirm("Replace this map with SAATHI's suggestion?")) return;
            setBusy(true);
            try {
              setM(await suggestFn({ data: { id: item.id } }));
              toast.success("Map suggested: check its places");
            } catch (e) {
              toast.error(errorText(e, "Couldn't suggest a map"));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          {busy ? "Suggesting…" : m ? "Suggest again" : "Suggest a map"}
        </Button>
        {left > 0 && (
          <span className="text-xs text-red-700 dark:text-red-400">
            ◇ {left} place{left === 1 ? "" : "s"} not in the place list: check{" "}
            {left === 1 ? "it" : "them"}
          </span>
        )}
      </div>
      <MapEdit map={m} onChange={setM} />
      {m && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            As the issue prints it
            {preview.isFetching && <RefreshCw className="h-3 w-3 animate-spin" />}
          </div>
          {preview.data?.html ? (
            <iframe
              title="Map preview"
              srcDoc={preview.data.html}
              className="h-72 w-full rounded-lg border border-border bg-white sm:h-80"
            />
          ) : (
            <div className="h-72 w-full animate-pulse rounded-lg bg-muted" />
          )}
        </div>
      )}
    </div>
  );
}
