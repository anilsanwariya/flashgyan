// What a student looked at lately, kept on the device: recent searches
// (what they picked from the search box) and "continue where you left off"
// (the last places and districts opened, and the topic they were reading).

export type RecentItem = {
  kind: "place" | "district";
  key: string;
  name: { en: string; hi: string };
  // A district's topic last opened (its key and title).
  topic?: string;
  topicTitle?: { en: string; hi: string };
  at: number;
};

const SEARCH_KEY = "atlas-recent-search";
const CONTINUE_KEY = "atlas-continue";

function read(key: string): RecentItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? (v as RecentItem[]).filter((x) => x && x.key && x.kind) : [];
  } catch {
    return [];
  }
}
function write(key: string, list: RecentItem[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
}
// The newest first, one entry per place or district.
function push(key: string, item: Omit<RecentItem, "at">, max: number) {
  const old = read(key).find((x) => x.kind === item.kind && x.key === item.key);
  const next = { ...old, ...item, at: Date.now() };
  // A district opened again keeps the topic it was on.
  if (!item.topic && old?.topic) {
    next.topic = old.topic;
    next.topicTitle = old.topicTitle;
  }
  write(
    key,
    [next, ...read(key).filter((x) => !(x.kind === item.kind && x.key === item.key))].slice(0, max),
  );
}

export const recentSearches = () => read(SEARCH_KEY);
export const rememberSearch = (item: Omit<RecentItem, "at">) => push(SEARCH_KEY, item, 6);
export const clearSearches = () => write(SEARCH_KEY, []);

export const continueList = () => read(CONTINUE_KEY);
export const rememberOpened = (item: Omit<RecentItem, "at">) => push(CONTINUE_KEY, item, 3);
export const forgetOpened = () => write(CONTINUE_KEY, []);
