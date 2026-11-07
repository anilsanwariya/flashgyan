// The atlas translation's cost controls: its model and effort, Message
// Batches on or off, the batch waiting for its replies, and a side-by-side
// test that translates facts with checked Hindi with each choice.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { atlasTranslateTest, setAtlasTranslate } from "@/lib/atlas.functions";
import { AI_EFFORTS, AI_MODELS, aiJobName, type AiJobSetting } from "@/lib/ai-jobs";
import { errorText } from "@/components/ca-ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type TestResult = Awaited<ReturnType<typeof atlasTranslateTest>>;
type Patch = {
  batch?: boolean;
  model?: "claude-sonnet-5" | "claude-haiku-5-5";
  effort?: AiJobSetting["effort"];
};

const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
const timeOf = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const modelOf = (m: string) => m as NonNullable<Patch["model"]>;

export function AtlasTranslateCost({
  setting,
  batch,
  pending,
  onChange,
}: {
  setting: AiJobSetting;
  batch: boolean;
  pending: { at: string; items: number } | null;
  onChange: () => Promise<unknown>;
}) {
  const setFn = useServerFn(setAtlasTranslate);
  const [open, setOpen] = useState(false);
  const save = async (patch: Patch, msg: string) => {
    try {
      await setFn({ data: patch });
      toast.success(msg);
      await onChange();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save it"));
    }
  };
  const select = "rounded-md border border-input bg-background px-2 py-1.5 text-sm";
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border p-3" data-translate-cost>
      {pending && (
        <p className="text-xs" role="status" data-batch-pending>
          A batch of {pending.items} items was sent {timeOf(pending.at)}: the Hindi comes back
          within hours, at half price.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Model</span>
          <select
            aria-label="Translation model"
            className={select}
            value={setting.model}
            onChange={(e) => void save({ model: modelOf(e.target.value) }, "Model saved")}
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Effort</span>
          <select
            aria-label="Translation effort"
            className={select}
            value={setting.effort}
            onChange={(e) =>
              void save({ effort: e.target.value as AiJobSetting["effort"] }, "Effort saved")
            }
          >
            {AI_EFFORTS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <Switch
            aria-label="Half price (Message Batches)"
            checked={batch}
            onCheckedChange={(v) =>
              void save(
                { batch: v },
                v ? "Batches on: half price, within hours" : "Batches off: full price, each minute",
              )
            }
          />
          Half price (sent as batches; the Hindi comes within hours)
        </label>
      </div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Compare models and effort…
      </Button>
      {open && (
        <CompareDialog
          current={setting}
          onClose={() => setOpen(false)}
          onUse={async (s) => {
            await save({ model: modelOf(s.model), effort: s.effort }, `Now: ${aiJobName(s)}`);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function CompareDialog({
  current,
  onClose,
  onUse,
}: {
  current: AiJobSetting;
  onClose: () => void;
  onUse: (s: AiJobSetting) => Promise<void>;
}) {
  const testFn = useServerFn(atlasTranslateTest);
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState<TestResult | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setR(await testFn());
    } catch (e) {
      toast.error(errorText(e, "Couldn't run the test"));
    } finally {
      setBusy(false);
    }
  };
  const same = (a: AiJobSetting, b: AiJobSetting) => a.model === b.model && a.effort === b.effort;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare models and effort</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Up to 10 facts whose Hindi you wrote or checked are translated again with each choice.
          Read each column against your Hindi and pick the cheapest that still reads right. One test
          costs well under a dollar.
        </p>
        {!r && (
          <Button disabled={busy} onClick={() => void run()} className="w-fit">
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            {busy ? "Translating with each choice… (about a minute)" : "Run the test"}
          </Button>
        )}
        {r && (
          <div className="overflow-x-auto" data-compare>
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="align-bottom">
                  <th className="w-56 border-b border-border p-2 text-left">Fact and your Hindi</th>
                  {r.runs.map((x, i) => (
                    <th key={i} className="border-b border-border p-2 text-left" data-run={i}>
                      <span className="block font-semibold">{aiJobName(x.setting)}</span>
                      {same(x.setting, current) && (
                        <span className="block text-xs font-normal text-primary">Now in use</span>
                      )}
                      {x.error ? (
                        <span className="block text-xs font-normal text-destructive">
                          {x.error}
                        </span>
                      ) : (
                        <span className="block text-xs font-normal text-muted-foreground">
                          This test {usd(x.cost)} · 1,000 facts ≈ {usd(x.per1000)} as a batch ·{" "}
                          {x.seconds}s
                        </span>
                      )}
                      {!x.error && !same(x.setting, current) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-1"
                          onClick={() => void onUse(x.setting)}
                        >
                          Use this
                        </Button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.facts.map((f, i) => (
                  <tr key={i} className="align-top">
                    <td className="border-b border-border p-2">
                      <span className="block text-xs text-muted-foreground">{f.en}</span>
                      <span className="mt-1 block" lang="hi">
                        {f.hi}
                      </span>
                    </td>
                    {r.runs.map((x, j) => (
                      <td key={j} className="border-b border-border p-2" lang="hi">
                        {x.hi[i] || <span className="text-xs text-destructive">(left out)</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => void run()}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Run it again
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
