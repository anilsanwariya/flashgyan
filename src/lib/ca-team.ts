// The editorial team's notebooks: shared by the server, the prompts and the
// admin page. Pure.

export type NotebookMember = "proofreader" | "updater";
export const NOTEBOOK_MAX = 15;

// A member's notebook in its prompt: a message after the fixed
// instructions, so the instructions stay the same for the prompt cache.
export function lessonsMessage(lessons: string[] | null | undefined) {
  const list = (lessons ?? []).map((l) => l.trim()).filter(Boolean);
  return list.length
    ? [
        {
          role: "system" as const,
          content: `LESSONS FROM THE EDITOR (learnt from their decisions; follow them):\n${list.map((l) => `- ${l}`).join("\n")}`,
        },
      ]
    : [];
}

// The weekly suggestion: what the member saw the editor decide, and its
// current notebook; it suggests up to 5 new lessons.
export function notebookSuggestMessages(
  member: NotebookMember,
  evidence: string[],
  current: string[],
) {
  const role =
    member === "proofreader"
      ? "the proofreader of a bilingual (Hindi and English) current affairs magazine. It checks stories against the editor's house style and checks that Hindi and English say the same. Below are notes it raised that the editor waved through as fine (false alarms), and notes the editor fixed."
      : "the updater of a bilingual current affairs magazine. It compares a later report with an earlier story and reports changed facts as corrections. Below are corrections the editor approved, and corrections the editor rejected (not real changes).";
  return [
    {
      role: "system" as const,
      content: `You keep the notebook of ${role}
Write up to 5 new lessons that would make its next notes or corrections match the editor's decisions: each one short, general and specific enough to act on (for example "Don't report a scheme's Hindi name written with a different but accepted spelling"), learnt from a pattern in at least two decisions. Don't repeat or contradict a lesson already in the notebook; an empty list is fine.
Reply with JSON only: {"lessons": ["..."]}`,
    },
    {
      role: "user" as const,
      content: `Notebook now:\n${current.length ? current.map((l) => `- ${l}`).join("\n") : "(empty)"}\n\nThe editor's decisions:\n${evidence.map((e) => `- ${e}`).join("\n")}`,
    },
  ];
}

export function parseLessons(raw: string, current: string[]): string[] {
  let o: { lessons?: unknown } | null = null;
  try {
    const m = /\{[\s\S]*\}/.exec(raw);
    o = m ? JSON.parse(m[0]) : null;
  } catch {
    o = null;
  }
  const have = new Set(current.map((l) => l.toLowerCase().trim()));
  return (Array.isArray(o?.lessons) ? o!.lessons : [])
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.replace(/\s+/g, " ").trim().slice(0, 240))
    .filter((l) => l.length >= 8 && !have.has(l.toLowerCase()))
    .slice(0, 5);
}
