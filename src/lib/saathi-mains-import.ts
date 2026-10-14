// Parses pasted or uploaded model answers for bulk import. Each answer starts
// with a "Q:" line; optional detail lines follow; the answer starts at "A:".
//
//   Q: Discuss the role of Rajasthan's stepwells in water conservation.
//   Marks: 10
//   Year: 2018
//   Paper: II
//   Subject: Art & Culture
//   A:
//   Stepwells (baoris) are ...
//
// Hindi labels work too: प्रश्न, उत्तर, अंक, वर्ष, प्रश्न पत्र, विषय.
import {
  detectMarks,
  isDirective,
  type MainsDirective,
} from "../../supabase/functions/_shared/saathi-mains.ts";

export type ParsedModelAnswer = {
  question: string;
  answer: string;
  marks: number | null;
  directive: MainsDirective | null;
  year: number | null;
  paper: string | null;
  subject: string | null;
  holdout: boolean;
};

const QUESTION = /^\s*(?:Q|Ques|Question|प्रश्न|प्र)\s*\.?\s*\d*\s*[:：.)-]\s*(.*)$/i;
const ANSWER = /^\s*(?:A|Ans|Answer|उत्तर|उ)\s*\.?\s*[:：.)-]\s*(.*)$/i;
const FIELD =
  /^\s*(Marks|अंक|Year|वर्ष|Paper|प्रश्न ?पत्र|Subject|विषय|Type|Test only|Holdout)\s*[:：]\s*(.*)$/i;

function fieldName(label: string): keyof ParsedModelAnswer | null {
  const l = label.toLowerCase().replace(/\s+/g, " ");
  if (l === "marks" || l === "अंक") return "marks";
  if (l === "year" || l === "वर्ष") return "year";
  if (l === "paper" || l.startsWith("प्रश्न")) return "paper";
  if (l === "subject" || l === "विषय") return "subject";
  if (l === "type") return "directive";
  if (l === "test only" || l === "holdout") return "holdout";
  return null;
}

export function parseModelAnswers(text: string): {
  items: ParsedModelAnswer[];
  errors: string[];
} {
  const items: ParsedModelAnswer[] = [];
  const errors: string[] = [];
  let cur: (ParsedModelAnswer & { inAnswer: boolean; line: number }) | null = null;

  const finish = () => {
    if (!cur) return;
    const question = cur.question.trim();
    const answer = cur.answer.trim();
    if (!question) errors.push(`Line ${cur.line}: question is empty.`);
    else if (!answer)
      errors.push(`Line ${cur.line}: "${question.slice(0, 50)}" has no answer (add an "A:" line).`);
    else {
      items.push({
        question,
        answer,
        marks: cur.marks ?? detectMarks(question),
        directive: cur.directive,
        year: cur.year,
        paper: cur.paper,
        subject: cur.subject,
        holdout: cur.holdout,
      });
    }
    cur = null;
  };

  const lines = text.replace(/\r/g, "").split("\n");
  lines.forEach((line, i) => {
    const q = QUESTION.exec(line);
    // A new question starts at a "Q:" line, unless we're inside an answer and
    // the line looks like part of it (answers rarely start lines with "Q:").
    if (q) {
      finish();
      cur = {
        question: q[1],
        answer: "",
        marks: null,
        directive: null,
        year: null,
        paper: null,
        subject: null,
        holdout: false,
        inAnswer: false,
        line: i + 1,
      };
      return;
    }
    if (!cur) {
      if (line.trim()) errors.push(`Line ${i + 1}: text before the first "Q:" line was skipped.`);
      return;
    }
    if (cur.inAnswer) {
      cur.answer += `${line}\n`;
      return;
    }
    const a = ANSWER.exec(line);
    if (a) {
      cur.inAnswer = true;
      cur.answer = a[1] ? `${a[1]}\n` : "";
      return;
    }
    const f = FIELD.exec(line);
    const name = f ? fieldName(f[1]) : null;
    if (f && name) {
      const value = f[2].trim();
      if (name === "marks") {
        const n = Number(/\d+/.exec(value)?.[0]);
        cur.marks = Number.isInteger(n) && n > 0 && n <= 50 ? n : null;
      } else if (name === "year") {
        const n = Number(/\d{4}/.exec(value)?.[0]);
        cur.year = Number.isInteger(n) ? n : null;
      } else if (name === "directive") {
        const v = value.toLowerCase();
        cur.directive = isDirective(v) ? v : null;
      } else if (name === "holdout") {
        cur.holdout = /^(y|yes|true|1|हाँ|हां)$/i.test(value);
      } else if (name === "paper") {
        cur.paper = value || null;
      } else if (name === "subject") {
        cur.subject = value || null;
      }
      return;
    }
    // More question text before the answer starts.
    cur.question += cur.question ? `\n${line}` : line;
  });
  finish();
  return { items, errors };
}

export const MODEL_ANSWER_TEMPLATE = `Q: Discuss the significance of stepwells (baoris) in Rajasthan's water management.
Marks: 10
Year: 2018
Paper: II
Subject: Art & Culture
A:
Stepwells, locally called baoris, are ...
- Point one ...
- Point two ...
Conclusion ...

Q: What is the Indira Gandhi Canal?
Marks: 2
A:
India's longest canal, bringing Sutlej-Beas water to north-west Rajasthan.
`;
