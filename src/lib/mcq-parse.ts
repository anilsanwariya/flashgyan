import * as XLSX from "xlsx";

export type ExplanationSection = { title: string; body: string };

export type ParsedMcqRow = {
  order_index: number;
  question: string;
  hint: string;
  option_1: string;
  option_2: string;
  option_3: string;
  option_4: string;
  answer: number; // 1-4
  explanation_sections: ExplanationSection[];
};

const REQUIRED = [
  "order",
  "question",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "answer",
] as const;

function normalizeKey(k: string) {
  return k.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(s: string) {
  return s
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function parseAnswer(
  raw: string,
  opts: { o1: string; o2: string; o3: string; o4: string },
): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (/^[1-4]$/.test(s)) return Number(s);
  const up = s.toUpperCase();
  if (["A", "B", "C", "D"].includes(up)) return "ABCD".indexOf(up) + 1;
  const m = s.toLowerCase().match(/^option[_ ]?([1-4])$/);
  if (m) return Number(m[1]);
  // Match against option text
  const list = [opts.o1, opts.o2, opts.o3, opts.o4];
  const idx = list.findIndex((o) => o.trim().toLowerCase() === s.toLowerCase());
  if (idx >= 0) return idx + 1;
  return null;
}

export function parseMcqWorkbook(file: ArrayBuffer): {
  rows: ParsedMcqRow[];
  invalid: number;
  missingCols: string[];
} {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  });
  if (json.length === 0) return { rows: [], invalid: 0, missingCols: [] };

  const originalKeys = Object.keys(json[0]);
  const headerMap: Record<string, string> = {};
  for (const k of originalKeys) headerMap[normalizeKey(k)] = k;

  const missingCols = REQUIRED.filter((c) => !(c in headerMap));
  if (missingCols.length) return { rows: [], invalid: 0, missingCols };

  const explanationCols: { key: string; title: string }[] = [];
  for (const k of originalKeys) {
    const nk = normalizeKey(k);
    if (nk.startsWith("explanation_")) {
      const suffix = nk.slice("explanation_".length);
      if (suffix) explanationCols.push({ key: k, title: titleCase(suffix) });
    }
  }

  const pick = (row: Record<string, unknown>, name: string) => {
    const k = headerMap[name];
    return k ? String(row[k] ?? "").trim() : "";
  };

  const rows: ParsedMcqRow[] = [];
  let invalid = 0;
  for (const row of json) {
    const orderRaw = pick(row, "order");
    const question = pick(row, "question");
    const hint = pick(row, "hint");
    const o1 = pick(row, "option_1");
    const o2 = pick(row, "option_2");
    const o3 = pick(row, "option_3");
    const o4 = pick(row, "option_4");
    const answerRaw = pick(row, "answer");
    const orderNum = Number(orderRaw);
    if (
      !question ||
      !o1 ||
      !o2 ||
      !o3 ||
      !o4 ||
      !orderRaw ||
      !Number.isFinite(orderNum) ||
      !Number.isInteger(orderNum)
    ) {
      invalid++;
      continue;
    }
    const answer = parseAnswer(answerRaw, { o1, o2, o3, o4 });
    if (!answer) {
      invalid++;
      continue;
    }
    const sections: ExplanationSection[] = [];
    for (const col of explanationCols) {
      const body = String(row[col.key] ?? "").trim();
      if (body) sections.push({ title: col.title, body });
    }
    rows.push({
      order_index: orderNum,
      question,
      hint,
      option_1: o1,
      option_2: o2,
      option_3: o3,
      option_4: o4,
      answer,
      explanation_sections: sections,
    });
  }
  return { rows, invalid, missingCols: [] };
}
