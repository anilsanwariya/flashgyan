// Exam weights (server): the saved papers grouped by exam with their current
// affairs questions per section, the editor's weights, and the exam profile
// kept for story picking and the practice set (made again when the weights
// change or the Exam papers page is opened).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  examFamily,
  weightOf,
  weightedShares,
  type ExamFamily,
  type ExamProfile,
} from "@/lib/ca-exam-weights";
import { getMagazineSettings, saveMagazineSettings } from "@/lib/current-affairs.server";

const from = (table: string) => supabaseAdmin.from(table as never);
const fail = (e: { message: string } | null) => {
  if (e) throw new Error(e.message);
};
const PROFILE_KEY = "ca_exam_profile";

// The profile from the papers and the weights now; saved for picking.
export async function makeProfile(): Promise<ExamProfile> {
  const weights = (await getMagazineSettings()).exam_weights ?? {};
  const { data, error } = await from("exam_papers").select("id,exam");
  if (error) {
    // Before the exam papers migration: nothing to weigh.
    if (/exam_papers|schema cache/.test(error.message))
      return { at: new Date().toISOString(), families: [], shares: {}, set: false };
    fail(error);
  }
  const papers = (data ?? []) as { id: string; exam: string }[];
  const familyOf = new Map(papers.map((p) => [p.id, examFamily(p.exam)]));
  const fams = new Map<string, ExamFamily>();
  for (const p of papers) {
    const f = familyOf.get(p.id)!;
    const x = fams.get(f) ?? {
      family: f,
      weight: weightOf(weights, f),
      papers: 0,
      questions: 0,
      sections: {},
    };
    x.papers++;
    fams.set(f, x);
  }
  const ids = papers.map((p) => p.id);
  for (let i = 0; i < ids.length; i += 100) {
    const { data: qs, error: qErr } = await from("exam_questions")
      .select("paper_id,section")
      .in("paper_id", ids.slice(i, i + 100))
      .eq("ca", true)
      .eq("deleted", false);
    if (qErr && /section/.test(qErr.message)) break;
    fail(qErr);
    for (const q of (qs ?? []) as { paper_id: string; section: string | null }[]) {
      const f = fams.get(familyOf.get(q.paper_id)!);
      if (!f) continue;
      f.questions++;
      if (q.section) f.sections[q.section] = (f.sections[q.section] ?? 0) + 1;
    }
  }
  const families = [...fams.values()].sort(
    (a, b) => b.weight - a.weight || b.papers - a.papers || a.family.localeCompare(b.family),
  );
  const profile: ExamProfile = {
    at: new Date().toISOString(),
    families,
    shares: weightedShares(families),
    set: Object.keys(weights).length > 0,
  };
  fail(
    (
      await from("bot_settings").upsert({
        key: PROFILE_KEY,
        value: profile,
        updated_at: new Date().toISOString(),
      } as never)
    ).error,
  );
  return profile;
}

// The saved profile (for picking: no recount), or null.
export async function savedProfile(): Promise<ExamProfile | null> {
  const { data } = await from("bot_settings").select("value").eq("key", PROFILE_KEY).maybeSingle();
  return (data as { value: ExamProfile } | null)?.value ?? null;
}

export async function saveWeights(weights: Record<string, number>): Promise<ExamProfile> {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(weights)) {
    const name = k.replace(/\s+/g, " ").trim().slice(0, 120);
    if (name && [0, 1, 2, 3].includes(v)) clean[name] = v;
  }
  await saveMagazineSettings({ exam_weights: clean });
  return makeProfile();
}
