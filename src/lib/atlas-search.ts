// Search that forgives spelling: "Jhunjhunun", "Jhunjhunu" and "झुंझुनूं" all
// find Jhunjhunu; "Chitorgarh", "Kumbalgarh" and "Ranthambhore" find their
// places. Names are brought to a loose form (no aspirates, long vowels,
// doubled letters, nasal marks) and a short slip is allowed. Pure.

const DEVANAGARI = /[ऀ-ॿ]/;

// A Latin name's loose form: "Jhunjhunun" → "junjunu", "Chittorgarh" →
// "citorgar", "Ranthambhore" → "rantambore".
export function looseLatin(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z ]+/g, " ")
    .replace(/ph/g, "f")
    .replace(/sh/g, "s")
    .replace(/([bcdgjklpt])h/g, "$1")
    .replace(/(?<=[aeiou])h(?=[^aeiou]|$)/g, "")
    .replace(/ee|ii/g, "i")
    .replace(/oo|uu/g, "u")
    .replace(/aa/g, "a")
    .replace(/[wv]/g, "v")
    .replace(/[zq]/g, (c) => (c === "z" ? "j" : "k"))
    .replace(/(.)\1+/g, "$1")
    .replace(/(?<=[aeiou])n(?= |$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A Hindi name's loose form: nasal marks, nukta and halant gone, long and
// short vowel signs the same.
export function looseHindi(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[ँं़्]/g, "")
    .replace(/ी/g, "ि")
    .replace(/ू/g, "ु")
    .replace(/आ/g, "अ")
    .replace(/ई/g, "इ")
    .replace(/ऊ/g, "उ")
    .replace(/[^ऀ-ॿ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const looseKey = (s: string) => (DEVANAGARI.test(s) ? looseHindi(s) : looseLatin(s));

// Edits between two short words (stops early past `max`).
function edits(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// How well a query matches a thing's names: 0 the same, 1 a name starts
// with it, 2 a word of a name starts with it, 3 a name has it, 4 a slip
// (one letter off, two in longer names); null for no match.
export function matchScore(query: string, names: string[]): number | null {
  const q = looseKey(query);
  if (q.length < 2) return null;
  let best: number | null = null;
  const take = (n: number) => {
    if (best === null || n < best) best = n;
  };
  for (const name of names) {
    if (!name || DEVANAGARI.test(name) !== DEVANAGARI.test(query)) continue;
    const k = looseKey(name);
    if (!k) continue;
    if (k === q) take(0);
    else if (k.startsWith(q)) take(1);
    else if (k.split(" ").some((w) => w.startsWith(q))) take(2);
    else if (k.includes(q)) take(3);
    else if (q.length >= 4) {
      const max = q.length >= 8 ? 2 : 1;
      // Against the name's start of the same length, and each word.
      const parts = [k.slice(0, q.length), ...k.split(" ").map((w) => w.slice(0, q.length + 1))];
      if (parts.some((p) => edits(q, p, max) <= max) || edits(q, k, max) <= max) take(4);
    }
    if (best === 0) break;
  }
  return best;
}

// Things ranked by how well they match (ties keep their order).
export function searchRank<T>(query: string, items: T[], names: (t: T) => string[]): T[] {
  return items
    .map((t, i) => ({ t, i, s: matchScore(query, names(t)) }))
    .filter((x) => x.s !== null)
    .sort((a, b) => a.s! - b.s! || a.i - b.i)
    .map((x) => x.t);
}
