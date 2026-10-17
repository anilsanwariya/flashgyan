// Admin screens for managing the Telegram bot: commands, automatic replies,
// messages and profile, broadcasts, stats and webhook.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  cancelBroadcast,
  countBroadcastAudience,
  createBroadcast,
  deleteBotAutoReply,
  deleteBotCommand,
  getBotProfile,
  getBotSettings,
  getBotStats,
  getWebhookStatus,
  listBotAutoReplies,
  listBotCommands,
  listBotSubjects,
  listBroadcasts,
  listBotUsersPage,
  resumeBroadcasts,
  saveBotAutoReply,
  saveBotCommand,
  saveBotMenuButton,
  saveBotProfile,
  saveBotSettings,
  sendTestBroadcast,
  setupWebhook,
  syncBotCommandMenu,
  uploadBotMedia,
  type BotAutoReplyRow,
  type BotCommandRow,
  type BroadcastRow,
  type BroadcastSegment,
} from "@/lib/bot-admin.functions";
import type { BotButton } from "../../supabase/functions/_shared/telegram.ts";

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function Section({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------- Message editor (text + photo/PDF + link buttons) ----------

export type MessageDraft = {
  text: string;
  media_url: string | null;
  media_type: "photo" | "document" | null;
  buttons: BotButton[];
};

const emptyMessage: MessageDraft = { text: "", media_url: null, media_type: null, buttons: [] };

async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    binary += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function MessageEditor({
  value,
  onChange,
}: {
  value: MessageDraft;
  onChange: (v: MessageDraft) => void;
}) {
  const upload = useServerFn(uploadBotMedia);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const set = (patch: Partial<MessageDraft>) => onChange({ ...value, ...patch });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const res = await upload({
        data: { filename: file.name, contentType: file.type, base64: await fileToBase64(file) },
      });
      set({ media_url: res.url, media_type: res.mediaType });
    } catch (err) {
      toast.error(errorText(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  const limit = value.media_url ? 1024 : 4000;
  return (
    <div className="space-y-3">
      <div>
        <Label>Message</Label>
        <Textarea
          value={value.text}
          onChange={(e) => set({ text: e.target.value })}
          rows={5}
          placeholder="Write the message. **bold**, *italic*, - bullets and [link text](https://…) work."
        />
        <p
          className={`mt-1 text-xs ${value.text.length > limit ? "text-destructive" : "text-muted-foreground"}`}
        >
          {value.text.length} / {limit} characters
          {value.media_url ? " (caption under a photo/PDF)" : ""}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Photo or PDF (optional)</Label>
        {value.media_url ? (
          <div className="flex items-center gap-2 rounded-lg border border-border p-2 text-sm">
            {value.media_type === "photo" ? (
              <img src={value.media_url} alt="" className="h-12 w-12 rounded object-cover" />
            ) : (
              <span className="rounded bg-muted px-2 py-1 text-xs">PDF</span>
            )}
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {value.media_url}
            </span>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => set({ media_url: null, media_type: null })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              className="hidden"
              onChange={onFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ImagePlus className="h-4 w-4" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <Input
              className="h-9 min-w-[16rem] flex-1"
              placeholder="…or paste an image/PDF link"
              onBlur={(e) => {
                const url = e.target.value.trim();
                if (!url) return;
                set({
                  media_url: url,
                  media_type: /\.pdf($|\?)/i.test(url) ? "document" : "photo",
                });
                e.target.value = "";
              }}
            />
          </div>
        )}
        {value.media_url && (
          <Select
            value={value.media_type ?? "photo"}
            onValueChange={(v) => set({ media_type: v as "photo" | "document" })}
          >
            <SelectTrigger className="h-8 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="photo">Send as photo</SelectItem>
              <SelectItem value="document">Send as file/PDF</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-2">
        <Label className="block">Buttons (optional)</Label>
        {value.buttons.map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              className="h-9 w-40"
              value={b.text}
              placeholder="Button text"
              onChange={(e) =>
                set({
                  buttons: value.buttons.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  ),
                })
              }
            />
            <Input
              className="h-9 min-w-[14rem] flex-1"
              value={b.url}
              placeholder="https://…"
              onChange={(e) =>
                set({
                  buttons: value.buttons.map((x, j) =>
                    j === i ? { ...x, url: e.target.value } : x,
                  ),
                })
              }
            />
            <Toggle
              checked={!!b.webApp}
              onChange={(v) =>
                set({ buttons: value.buttons.map((x, j) => (j === i ? { ...x, webApp: v } : x)) })
              }
              label="Open inside Telegram"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => set({ buttons: value.buttons.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {value.buttons.length < 8 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => set({ buttons: [...value.buttons, { text: "", url: "https://" }] })}
          >
            <Plus className="h-4 w-4" /> Add button
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------- Commands ----------

type CommandDraft = Omit<
  BotCommandRow,
  "id" | "response_text" | "media_url" | "media_type" | "buttons"
> & {
  id: string | null;
  message: MessageDraft;
};

const newCommand: CommandDraft = {
  id: null,
  command: "",
  description_en: "",
  description_hi: "",
  action: "message",
  builtin: null,
  show_in_menu: true,
  scope: "private",
  enabled: true,
  sort_order: 50,
  message: emptyMessage,
};

const BUILTINS: Record<NonNullable<BotCommandRow["builtin"]>, string> = {
  study: "Main menu (flashcards + MCQ)",
  flashcards: "Flashcard subjects",
  mcq: "MCQ quiz subjects",
  ask: "Ask SAATHI (text after the command)",
  answer: "SAATHI writes a Mains answer (marks, then the question)",
  daily: "Daily current affairs quiz: pick a time, see the streak, take today's quiz",
  check: "SAATHI checks a Mains answer: question, then typed text or handwritten photos (3 a day)",
  help: "List all commands",
};

export function BotCommandsPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBotCommands);
  const saveFn = useServerFn(saveBotCommand);
  const deleteFn = useServerFn(deleteBotCommand);
  const syncFn = useServerFn(syncBotCommandMenu);
  const q = useQuery({ queryKey: ["bot-commands"], queryFn: () => listFn() });
  const [draft, setDraft] = useState<CommandDraft | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(c: BotCommandRow) {
    setDraft({
      ...c,
      message: {
        text: c.response_text,
        media_url: c.media_url,
        media_type: c.media_type,
        buttons: c.buttons ?? [],
      },
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const { message, ...rest } = draft;
      await saveFn({
        data: {
          ...rest,
          response_text: message.text,
          media_url: message.media_url,
          media_type: message.media_type,
          buttons: message.buttons,
        },
      });
      toast.success(
        "Saved. The bot uses it within a minute; publish the menu to update the / list.",
      );
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["bot-commands"] });
    } catch (e) {
      toast.error(errorText(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: BotCommandRow) {
    if (!confirm(`Delete /${c.command}?`)) return;
    try {
      await deleteFn({ data: { id: c.id } });
      qc.invalidateQueries({ queryKey: ["bot-commands"] });
    } catch (e) {
      toast.error(errorText(e, "Delete failed"));
    }
  }

  async function publish() {
    setBusy(true);
    try {
      const r = await syncFn();
      toast.success(`Menu published: ${r.private} commands in chats, ${r.groups} in groups`);
    } catch (e) {
      toast.error(errorText(e, "Publish failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Commands"
        hint="Commands users type, like /notes. Changes reach the bot within a minute. Publish the menu to update the list users see when they type /."
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={publish} disabled={busy}>
              <RefreshCw className="h-4 w-4" /> Publish menu to Telegram
            </Button>
            <Button onClick={() => setDraft({ ...newCommand })}>
              <Plus className="h-4 w-4" /> New command
            </Button>
          </div>
        }
      >
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{errorText(q.error, "Failed to load")}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Command</th>
                  <th className="px-3 py-2">Does</th>
                  <th className="hidden px-3 py-2 sm:table-cell">Where</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((c) => (
                  <tr
                    key={c.id}
                    className={`border-t border-border align-top ${c.enabled ? "" : "opacity-50"}`}
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono font-medium">/{c.command}</div>
                      <div className="text-xs text-muted-foreground">{c.description_en}</div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {c.action === "builtin"
                        ? BUILTINS[c.builtin ?? "study"]
                        : (c.response_text || "(photo/PDF)").slice(0, 80)}
                      <div className="mt-1 text-muted-foreground sm:hidden">
                        {c.scope === "all" ? "Chats + groups" : "Chats"}
                        {!c.show_in_menu && " · hidden from menu"}
                        {!c.enabled && " · off"}
                      </div>
                    </td>
                    <td className="hidden px-3 py-2 text-xs sm:table-cell">
                      {c.scope === "all" ? "Chats + groups" : "Chats"}
                      {!c.show_in_menu && " · hidden from menu"}
                      {!c.enabled && " · off"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => edit(c)}
                        aria-label={`Edit /${c.command}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {c.command !== "start" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(c)}
                          aria-label={`Delete /${c.command}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {draft && (
        <Section
          title={draft.id ? `Edit /${draft.command}` : "New command"}
          action={
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              <X className="h-4 w-4" /> Close
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>Command</Label>
              <Input
                value={draft.command}
                disabled={draft.command === "start" && !!draft.id}
                onChange={(e) => setDraft({ ...draft, command: e.target.value.toLowerCase() })}
                placeholder="notes"
              />
            </div>
            <div>
              <Label>Menu text (English)</Label>
              <Input
                value={draft.description_en}
                onChange={(e) => setDraft({ ...draft, description_en: e.target.value })}
              />
            </div>
            <div>
              <Label>Menu text (Hindi)</Label>
              <Input
                value={draft.description_hi}
                onChange={(e) => setDraft({ ...draft, description_hi: e.target.value })}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label>What it does</Label>
              <Select
                value={
                  draft.action === "builtin" ? `builtin:${draft.builtin ?? "study"}` : "message"
                }
                onValueChange={(v) =>
                  setDraft(
                    v === "message"
                      ? { ...draft, action: "message", builtin: null }
                      : {
                          ...draft,
                          action: "builtin",
                          builtin: v.split(":")[1] as CommandDraft["builtin"],
                        },
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message">Send a message</SelectItem>
                  {Object.entries(BUILTINS).map(([k, label]) => (
                    <SelectItem key={k} value={`builtin:${k}`}>
                      Run: {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Works in</Label>
              <Select
                value={draft.scope}
                onValueChange={(v) => setDraft({ ...draft, scope: v as "private" | "all" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private chats only</SelectItem>
                  <SelectItem value="all">Private chats and groups</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order in menu</Label>
              <Input
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Toggle
              checked={draft.show_in_menu}
              onChange={(v) => setDraft({ ...draft, show_in_menu: v })}
              label="Show in / menu"
            />
            <Toggle
              checked={draft.enabled}
              onChange={(v) => setDraft({ ...draft, enabled: v })}
              label="Turned on"
            />
          </div>
          {draft.action === "message" && (
            <MessageEditor
              value={draft.message}
              onChange={(m) => setDraft({ ...draft, message: m })}
            />
          )}
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save command"}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------- Automatic replies ----------

type ReplyDraft = {
  id: string | null;
  keywords: string;
  match_type: "contains" | "exact";
  enabled: boolean;
  priority: number;
  message: MessageDraft;
};

export function BotAutoRepliesPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBotAutoReplies);
  const saveFn = useServerFn(saveBotAutoReply);
  const deleteFn = useServerFn(deleteBotAutoReply);
  const q = useQuery({ queryKey: ["bot-auto-replies"], queryFn: () => listFn() });
  const [draft, setDraft] = useState<ReplyDraft | null>(null);
  const [busy, setBusy] = useState(false);

  function edit(r: BotAutoReplyRow) {
    setDraft({
      id: r.id,
      keywords: r.keywords.join(", "),
      match_type: r.match_type,
      enabled: r.enabled,
      priority: r.priority,
      message: {
        text: r.response_text,
        media_url: r.media_url,
        media_type: r.media_type,
        buttons: r.buttons ?? [],
      },
    });
  }

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          id: draft.id,
          keywords: draft.keywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
          match_type: draft.match_type,
          enabled: draft.enabled,
          priority: draft.priority,
          response_text: draft.message.text,
          media_url: draft.message.media_url,
          media_type: draft.message.media_type,
          buttons: draft.message.buttons,
        },
      });
      toast.success("Saved. The bot uses it within a minute.");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["bot-auto-replies"] });
    } catch (e) {
      toast.error(errorText(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(r: BotAutoReplyRow) {
    if (!confirm("Delete this automatic reply?")) return;
    try {
      await deleteFn({ data: { id: r.id } });
      qc.invalidateQueries({ queryKey: ["bot-auto-replies"] });
    } catch (e) {
      toast.error(errorText(e, "Delete failed"));
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Automatic replies"
        hint="When someone sends the bot a normal message (not a command) containing these words, it replies automatically. The first match by order wins."
        action={
          <Button
            onClick={() =>
              setDraft({
                id: null,
                keywords: "",
                match_type: "contains",
                enabled: true,
                priority: 100,
                message: emptyMessage,
              })
            }
          >
            <Plus className="h-4 w-4" /> New reply
          </Button>
        }
      >
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.error ? (
          <p className="text-sm text-destructive">{errorText(q.error, "Failed to load")}</p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No automatic replies yet. Try one for "fees", "syllabus" or "app".
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When the message {""}contains</th>
                  <th className="px-3 py-2">Reply</th>
                  <th className="px-3 py-2 text-right">Used</th>
                  <th className="px-3 py-2 w-24" />
                </tr>
              </thead>
              <tbody>
                {(q.data ?? []).map((r) => (
                  <tr
                    key={r.id}
                    className={`border-t border-border align-top ${r.enabled ? "" : "opacity-50"}`}
                  >
                    <td className="px-3 py-2 text-xs">
                      {r.match_type === "exact" ? "Exactly: " : ""}
                      {r.keywords.join(", ")}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {(r.response_text || "(photo/PDF)").slice(0, 80)}
                    </td>
                    <td className="px-3 py-2 text-right">{r.hits}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => edit(r)}
                        aria-label="Edit reply"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => remove(r)}
                        aria-label="Delete reply"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {draft && (
        <Section
          title={draft.id ? "Edit automatic reply" : "New automatic reply"}
          action={
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
              <X className="h-4 w-4" /> Close
            </Button>
          }
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem_8rem]">
            <div>
              <Label>Words or phrases (comma-separated, English or Hindi)</Label>
              <Input
                value={draft.keywords}
                onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
                placeholder="fees, fee, शुल्क"
              />
            </div>
            <div>
              <Label>Match</Label>
              <Select
                value={draft.match_type}
                onValueChange={(v) => setDraft({ ...draft, match_type: v as "contains" | "exact" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Message contains it</SelectItem>
                  <SelectItem value="exact">Message is exactly it</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Order</Label>
              <Input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 0 })}
              />
            </div>
          </div>
          <Toggle
            checked={draft.enabled}
            onChange={(v) => setDraft({ ...draft, enabled: v })}
            label="Turned on"
          />
          <MessageEditor
            value={draft.message}
            onChange={(m) => setDraft({ ...draft, message: m })}
          />
          <div className="flex justify-end">
            <Button onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save reply"}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------- Messages, profile and menu button ----------

export function BotMessagesPanel() {
  const settingsFn = useServerFn(getBotSettings);
  const saveSettingsFn = useServerFn(saveBotSettings);
  const profileFn = useServerFn(getBotProfile);
  const saveProfileFn = useServerFn(saveBotProfile);
  const saveMenuFn = useServerFn(saveBotMenuButton);
  const settingsQ = useQuery({ queryKey: ["bot-settings"], queryFn: () => settingsFn() });
  const profileQ = useQuery({ queryKey: ["bot-profile"], queryFn: () => profileFn() });

  const [s, setS] = useState(settingsQ.data);
  const [p, setP] = useState(profileQ.data);
  const [menu, setMenu] = useState<{ type: "commands" | "web_app"; text: string; url: string }>({
    type: "commands",
    text: "Open FlashGyan",
    url: "https://www.flashgyan.com",
  });
  useEffect(() => setS(settingsQ.data), [settingsQ.data]);
  useEffect(() => {
    setP(profileQ.data);
    const mb = profileQ.data?.menu_button;
    if (mb?.type === "web_app")
      setMenu({ type: "web_app", text: mb.text ?? "", url: mb.url ?? "" });
  }, [profileQ.data]);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Bot messages"
        hint="What the bot says. Changes reach the bot within a minute."
      >
        {!s ? (
          <p className="text-sm text-muted-foreground">
            {settingsQ.error ? errorText(settingsQ.error, "Failed to load") : "Loading…"}
          </p>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Welcome message (/start and the main menu)</Label>
              <Textarea
                rows={3}
                value={s.welcome_text}
                onChange={(e) => setS({ ...s, welcome_text: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Flashcards button</Label>
                <Input
                  value={s.flashcards_button}
                  onChange={(e) => setS({ ...s, flashcards_button: e.target.value })}
                />
              </div>
              <div>
                <Label>MCQ button</Label>
                <Input
                  value={s.mcq_button}
                  onChange={(e) => setS({ ...s, mcq_button: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Reply to anything the bot doesn't understand</Label>
              <Textarea
                rows={2}
                value={s.fallback_text}
                onChange={(e) => setS({ ...s, fallback_text: e.target.value })}
              />
            </div>
            <Toggle
              checked={s.free_text_to_saathi}
              onChange={(v) => setS({ ...s, free_text_to_saathi: v })}
              label="Answer plain messages with SAATHI (instead of the reply above, when no automatic reply matches)"
            />
            <div>
              <Label>Test chat ids (yours, for test broadcasts; comma-separated)</Label>
              <Input
                value={s.admin_chat_ids}
                onChange={(e) => setS({ ...s, admin_chat_ids: e.target.value })}
                placeholder="123456789"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Your chat id is in the Users list after you message the bot once.
              </p>
            </div>
            <div className="flex justify-end">
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "settings",
                    () =>
                      saveSettingsFn({
                        data: {
                          welcome_text: s.welcome_text,
                          flashcards_button: s.flashcards_button,
                          mcq_button: s.mcq_button,
                          fallback_text: s.fallback_text,
                          free_text_to_saathi: s.free_text_to_saathi,
                          admin_chat_ids: s.admin_chat_ids,
                        },
                      }),
                    "Messages saved",
                  )
                }
              >
                {busy === "settings" ? "Saving…" : "Save messages"}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Bot profile"
        hint="Name and descriptions shown on the bot's profile and before someone starts it. Leave Hindi empty to show English to everyone."
      >
        {!p ? (
          <p className="text-sm text-muted-foreground">
            {profileQ.error ? errorText(profileQ.error, "Failed to load") : "Loading…"}
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">
              Bot: <span className="font-mono">@{p.username}</span>
            </p>
            {(
              [
                ["name", "Name", 64, false],
                ["short", "About (short description)", 120, false],
                ["description", "What can this bot do? (shown before Start)", 512, true],
              ] as const
            ).map(([key, label, max, long]) => (
              <div key={key} className="grid gap-3 sm:grid-cols-2">
                {(["en", "hi"] as const).map((lang) => {
                  const field = `${key}_${lang}` as keyof typeof p;
                  const val = String(p[field] ?? "");
                  const onChange = (v: string) => setP({ ...p, [field]: v });
                  return (
                    <div key={lang}>
                      <Label>
                        {label} — {lang === "en" ? "English" : "Hindi"}
                      </Label>
                      {long ? (
                        <Textarea
                          rows={3}
                          maxLength={max}
                          value={val}
                          onChange={(e) => onChange(e.target.value)}
                        />
                      ) : (
                        <Input
                          maxLength={max}
                          value={val}
                          onChange={(e) => onChange(e.target.value)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            <div className="flex justify-end">
              <Button
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "profile",
                    () =>
                      saveProfileFn({
                        data: {
                          name_en: p.name_en,
                          name_hi: p.name_hi,
                          description_en: p.description_en,
                          description_hi: p.description_hi,
                          short_en: p.short_en,
                          short_hi: p.short_hi,
                        },
                      }),
                    "Profile updated on Telegram",
                  )
                }
              >
                {busy === "profile" ? "Saving…" : "Save profile"}
              </Button>
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Menu button"
        hint="The button next to the message box. Show the command list, or open the FlashGyan website inside Telegram."
      >
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr_1fr]">
          <Select
            value={menu.type}
            onValueChange={(v) => setMenu({ ...menu, type: v as "commands" | "web_app" })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="commands">Command list</SelectItem>
              <SelectItem value="web_app">Open website (Mini App)</SelectItem>
            </SelectContent>
          </Select>
          {menu.type === "web_app" && (
            <>
              <Input
                value={menu.text}
                onChange={(e) => setMenu({ ...menu, text: e.target.value })}
                placeholder="Button text"
              />
              <Input
                value={menu.url}
                onChange={(e) => setMenu({ ...menu, url: e.target.value })}
                placeholder="https://…"
              />
            </>
          )}
        </div>
        <div className="flex justify-end">
          <Button
            disabled={busy !== null}
            onClick={() => run("menu", () => saveMenuFn({ data: menu }), "Menu button updated")}
          >
            {busy === "menu" ? "Saving…" : "Save menu button"}
          </Button>
        </div>
      </Section>
    </div>
  );
}

// ---------- Broadcasts ----------

const segmentLabel = (s: BroadcastSegment) =>
  s.type === "all"
    ? "Everyone"
    : s.type === "active"
      ? `Active in last ${s.days} days`
      : s.type === "language"
        ? s.language === "hi"
          ? "Hindi users"
          : "English users"
        : `Studied ${s.subject}`;

export function BotBroadcastPanel() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBroadcasts);
  const countFn = useServerFn(countBroadcastAudience);
  const subjectsFn = useServerFn(listBotSubjects);
  const createFn = useServerFn(createBroadcast);
  const cancelFn = useServerFn(cancelBroadcast);
  const testFn = useServerFn(sendTestBroadcast);
  const resumeFn = useServerFn(resumeBroadcasts);

  const [message, setMessage] = useState<MessageDraft>(emptyMessage);
  const [segment, setSegment] = useState<BroadcastSegment>({ type: "all" });
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const subjectsQ = useQuery({ queryKey: ["bot-subjects"], queryFn: () => subjectsFn() });
  const audienceQ = useQuery({
    queryKey: ["bot-audience", segment],
    queryFn: () => countFn({ data: segment }),
  });
  const sending = (rows?: BroadcastRow[]) => (rows ?? []).some((b) => b.status === "sending");
  const waiting = (rows?: BroadcastRow[]) =>
    (rows ?? []).some((b) => b.status === "sending" || b.status === "scheduled");
  const listQ = useQuery({
    queryKey: ["bot-broadcasts"],
    queryFn: () => listFn(),
    refetchInterval: (query) =>
      sending(query.state.data) ? 3000 : waiting(query.state.data) ? 30_000 : false,
  });

  // While this page is open, keep running broadcasts moving and start
  // scheduled ones when they fall due.
  const anyWaiting = waiting(listQ.data);
  useEffect(() => {
    if (!anyWaiting) return;
    const timer = setInterval(() => resumeFn().catch(() => {}), 30_000);
    return () => clearInterval(timer);
  }, [anyWaiting, resumeFn]);

  const payload = useMemo(
    () => ({
      text: message.text,
      media_url: message.media_url,
      media_type: message.media_type,
      buttons: message.buttons.filter((b) => b.text.trim() && b.url.trim() !== "https://"),
    }),
    [message],
  );

  async function test() {
    setBusy("test");
    try {
      const r = await testFn({ data: payload });
      toast.success(`Test sent to ${r.sent} chat${r.sent === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(errorText(e, "Test failed"));
    } finally {
      setBusy(null);
    }
  }

  async function send() {
    const scheduled = when ? new Date(when) : null;
    const count = audienceQ.data ?? 0;
    const label = scheduled ? `Schedule for ${scheduled.toLocaleString()}` : "Send now";
    if (!confirm(`${label} to ${count} user${count === 1 ? "" : "s"} (${segmentLabel(segment)})?`))
      return;
    setBusy("send");
    try {
      await createFn({
        data: { ...payload, segment, scheduled_at: scheduled ? scheduled.toISOString() : null },
      });
      toast.success(scheduled ? "Broadcast scheduled" : "Sending started");
      setMessage(emptyMessage);
      setWhen("");
      qc.invalidateQueries({ queryKey: ["bot-broadcasts"] });
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    try {
      await cancelFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["bot-broadcasts"] });
    } catch (e) {
      toast.error(errorText(e, "Cancel failed"));
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="New broadcast"
        hint="Send a message to bot users. Test it on yourself first. Sending runs on the server; you can close this page."
      >
        <MessageEditor value={message} onChange={setMessage} />
        <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
          <div>
            <Label>Send to</Label>
            <Select
              value={segment.type}
              onValueChange={(v) =>
                setSegment(
                  v === "active"
                    ? { type: "active", days: 7 }
                    : v === "language"
                      ? { type: "language", language: "hi" }
                      : v === "subject"
                        ? { type: "subject", subject: subjectsQ.data?.[0] ?? "" }
                        : { type: "all" },
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="active">Recently active</SelectItem>
                <SelectItem value="language">By language</SelectItem>
                <SelectItem value="subject">Studied a subject</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2">
            {segment.type === "active" && (
              <Select
                value={String(segment.days)}
                onValueChange={(v) => setSegment({ type: "active", days: Number(v) })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 7, 14, 30, 90].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      In the last {d} day{d === 1 ? "" : "s"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {segment.type === "language" && (
              <Select
                value={segment.language}
                onValueChange={(v) => setSegment({ type: "language", language: v as "hi" | "en" })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hi">Hindi (Telegram set to Hindi)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            )}
            {segment.type === "subject" && (
              <Select
                value={segment.subject}
                onValueChange={(v) => setSegment({ type: "subject", subject: v })}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Pick a subject" />
                </SelectTrigger>
                <SelectContent>
                  {(subjectsQ.data ?? []).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <span className="pb-2 text-sm text-muted-foreground">
              {audienceQ.isFetching ? "Counting…" : `${audienceQ.data ?? 0} users`}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label>When</Label>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-60"
            />
            <p className="mt-1 text-xs text-muted-foreground">Leave empty to send now.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={test} disabled={busy !== null}>
              {busy === "test" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}{" "}
              Send test to me
            </Button>
            <Button
              onClick={send}
              disabled={busy !== null || (segment.type === "subject" && !segment.subject)}
            >
              {busy === "send" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {when ? "Schedule" : "Send now"}
            </Button>
          </div>
        </div>
      </Section>

      <Section title="Broadcast history">
        {(listQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No broadcasts yet.</p>
        ) : (
          <ul className="space-y-2">
            {(listQ.data ?? []).map((b) => {
              const done = b.sent + b.failed + b.blocked;
              const pct = b.total ? Math.min(100, Math.round((done / b.total) * 100)) : 0;
              return (
                <li key={b.id} className="rounded-lg border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {b.text.slice(0, 120) || "(photo/PDF)"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {segmentLabel(b.segment)} ·{" "}
                        {b.status === "scheduled"
                          ? `scheduled for ${new Date(b.scheduled_at).toLocaleString()}`
                          : b.status}
                      </div>
                    </div>
                    {(b.status === "scheduled" || b.status === "sending") && (
                      <Button size="sm" variant="outline" onClick={() => cancel(b.id)}>
                        Cancel
                      </Button>
                    )}
                  </div>
                  {b.status !== "scheduled" && (
                    <div className="mt-2 space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Sent {b.sent} of {b.total} · failed {b.failed} · blocked the bot {b.blocked}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ---------- Stats ----------

export function BotStatsPanel() {
  const statsFn = useServerFn(getBotStats);
  const [days, setDays] = useState(30);
  const q = useQuery({ queryKey: ["bot-stats", days], queryFn: () => statsFn({ data: { days } }) });
  const s = q.data;
  const maxActive = Math.max(1, ...(s?.daily ?? []).map((d) => d.active));
  const kindLabel: Record<string, string> = {
    command: "Command",
    auto_reply: "Auto-reply",
    flashcards: "Flashcards",
    mcq: "MCQ",
  };

  return (
    <Section
      title="Usage"
      action={
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[7, 30, 90].map((d) => (
              <SelectItem key={d} value={String(d)}>
                Last {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      {!s ? (
        <p className="text-sm text-muted-foreground">
          {q.error ? errorText(q.error, "Failed to load") : "Loading…"}
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {(
              [
                ["Users", s.users_total],
                ["Active (7 days)", s.users_active_7d],
                [`New (${days} days)`, s.new_users],
                ["Blocked the bot", s.users_blocked],
                [`SAATHI questions (${days} days)`, s.saathi_questions],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border p-3">
                <div className="text-2xl font-semibold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Active users per day</h4>
            {s.daily.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <div className="flex h-32 items-end gap-1">
                {s.daily.map((d) => (
                  <div
                    key={d.day}
                    className="flex-1 rounded-t bg-primary/70"
                    style={{ height: `${Math.max(4, (d.active / maxActive) * 100)}%` }}
                    title={`${d.day}: ${d.active} users, ${d.events} actions`}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium">Most used</h4>
            {s.top.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {s.top.map((t) => (
                  <li key={`${t.kind}:${t.name}`} className="flex justify-between gap-3 px-3 py-2">
                    <span>
                      <span className="text-muted-foreground">{kindLabel[t.kind] ?? t.kind}:</span>{" "}
                      {t.kind === "command" ? `/${t.name}` : t.name || "—"}
                    </span>
                    <span className="tabular-nums">{t.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// ---------- Webhook ----------

export function BotWebhookPanel() {
  const qc = useQueryClient();
  const statusFn = useServerFn(getWebhookStatus);
  const setupFn = useServerFn(setupWebhook);
  const q = useQuery({ queryKey: ["bot-webhook"], queryFn: () => statusFn() });
  const [busy, setBusy] = useState(false);
  const w = q.data;
  const connected = w && w.url === w.expected_url;
  const cronSql = w
    ? `-- Optional: send scheduled broadcasts on time even when nobody is using the bot.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('bot-broadcasts', '* * * * *',
  $$select net.http_post(url := '${w.expected_url}?task=broadcast')$$);`
    : "";

  async function secure() {
    if (!confirm("Reconnect the bot with a new secret token? It takes a few seconds.")) return;
    setBusy(true);
    try {
      await setupFn();
      toast.success("Webhook secured");
      qc.invalidateQueries({ queryKey: ["bot-webhook"] });
    } catch (e) {
      toast.error(errorText(e, "Failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section
        title="Connection"
        hint="How Telegram delivers messages to the bot."
        action={
          <Button variant="outline" size="sm" onClick={() => q.refetch()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        }
      >
        {!w ? (
          <p className="text-sm text-muted-foreground">
            {q.error ? errorText(q.error, "Failed to load") : "Loading…"}
          </p>
        ) : (
          <div className="space-y-3 text-sm">
            <p>
              Status:{" "}
              <span
                className={
                  connected ? "font-medium text-emerald-600" : "font-medium text-destructive"
                }
              >
                {connected
                  ? "Connected"
                  : w.url
                    ? "Connected to a different address"
                    : "Not connected"}
              </span>
              {" · "}
              Secret token:{" "}
              <span
                className={
                  w.has_secret ? "font-medium text-emerald-600" : "font-medium text-amber-600"
                }
              >
                {w.has_secret ? "On" : "Off"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground break-all">Address: {w.url || "—"}</p>
            <p className="text-xs text-muted-foreground">
              Waiting messages: {w.pending_update_count}
            </p>
            {w.last_error_message && (
              <p className="text-xs text-destructive">
                Last error ({w.last_error_date ? new Date(w.last_error_date).toLocaleString() : ""}
                ): {w.last_error_message}
              </p>
            )}
            {(!w.has_secret || !connected) && (
              <p className="rounded-lg bg-amber-500/10 p-3 text-xs">
                Without a secret token, anyone who knows the bot's address could send it fake
                messages. Securing it reconnects the bot with a secret only Telegram knows.
              </p>
            )}
            <Button onClick={secure} disabled={busy}>
              <ShieldCheck className="h-4 w-4" />{" "}
              {busy ? "Securing…" : w.has_secret ? "Rotate secret token" : "Secure webhook"}
            </Button>
          </div>
        )}
      </Section>

      {w && (
        <Section
          title="Scheduled broadcasts on time"
          hint="Scheduled broadcasts are sent when the bot is next used or when this admin page is open. To send them exactly on time, run this once in the Supabase SQL editor."
        >
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">{cronSql}</pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(cronSql).then(
                () => toast.success("Copied"),
                () => toast.error("Couldn't copy"),
              );
            }}
          >
            <Copy className="h-4 w-4" /> Copy SQL
          </Button>
        </Section>
      )}
    </div>
  );
}

// ---------- Users ----------

export function BotUsersPanel() {
  const listFn = useServerFn(listBotUsersPage);
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["bot-users-page", term],
    queryFn: () => listFn({ data: { search: term, limit: 200 } }),
  });

  return (
    <Section
      title="Users"
      hint="People who have used the bot, most recent first. Copy your own chat id into Messages → Test chat ids."
    >
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search);
        }}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, @username or chat id"
        />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {!q.data ? (
        <p className="text-sm text-muted-foreground">
          {q.error ? errorText(q.error, "Failed to load") : "Loading…"}
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Showing {q.data.rows.length} of {q.data.total}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Chat id</th>
                  <th className="px-3 py-2">Language</th>
                  <th className="px-3 py-2">Last active</th>
                </tr>
              </thead>
              <tbody>
                {q.data.rows.map((u) => (
                  <tr
                    key={u.chat_id}
                    className={`border-t border-border ${u.blocked ? "opacity-50" : ""}`}
                  >
                    <td className="px-3 py-2">
                      {u.first_name ?? "—"}
                      {u.username && <span className="text-muted-foreground"> @{u.username}</span>}
                      {u.blocked && (
                        <span className="ml-1 text-xs text-destructive">blocked the bot</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{u.chat_id}</td>
                    <td className="px-3 py-2 text-xs">{u.language_code ?? "—"}</td>
                    <td className="px-3 py-2 text-xs">
                      {new Date(u.last_active).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}
