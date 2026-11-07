// A background AI job's model and effort, chosen by the admin (kept in
// bot_settings, ai_jobs). Left at "default", a job runs as every call does:
// the chat model at its default effort.

export type AiJobKey = "atlas_translate";
export type AiEffort = "default" | "high" | "medium" | "low";
export type AiJobSetting = { model: string; effort: AiEffort };

export const AI_JOBS: Record<AiJobKey, { name: string }> = {
  atlas_translate: { name: "Atlas Hindi translation" },
};

export const AI_MODELS = [
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
] as const;

export const AI_EFFORTS: { id: AiEffort; name: string }[] = [
  { id: "default", name: "Model's default" },
  { id: "high", name: "High" },
  { id: "medium", name: "Medium" },
  { id: "low", name: "Low" },
];

export const DEFAULT_AI_JOB: AiJobSetting = { model: "claude-sonnet-5", effort: "default" };

export function aiJobOf(v: unknown): AiJobSetting {
  const o = (v && typeof v === "object" ? v : {}) as Partial<AiJobSetting>;
  return {
    model: AI_MODELS.some((m) => m.id === o.model) ? String(o.model) : DEFAULT_AI_JOB.model,
    effort: AI_EFFORTS.some((e) => e.id === o.effort) ? (o.effort as AiEffort) : "default",
  };
}

// The call options for saathiComplete / a batch.
export const aiJobOptions = (s: AiJobSetting, maxTokens?: number) => ({
  model: s.model,
  ...(s.effort !== "default" ? { effort: s.effort } : {}),
  ...(maxTokens ? { maxTokens } : {}),
});

export const aiJobName = (s: AiJobSetting) =>
  `${AI_MODELS.find((m) => m.id === s.model)?.name ?? s.model}, ${
    AI_EFFORTS.find((e) => e.id === s.effort)?.name.toLowerCase() ?? s.effort
  } effort`;
