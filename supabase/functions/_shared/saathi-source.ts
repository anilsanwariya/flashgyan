// How SAATHI cites its notes to students: the publisher and the book
// ("NCERT · Indian Constitution at Work"), or the book alone when its
// publisher isn't set. Shared by the website, the Telegram bot and the magazine.
export function sourceLabel(s: { title: string; source?: string | null }): string {
  const by = s.source?.trim();
  return by && by !== s.title ? `${by} · ${s.title}` : s.title;
}
