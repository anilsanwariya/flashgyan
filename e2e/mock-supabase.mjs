// A stand-in for Supabase's REST API with fixed sample data, so the browser tests
// never touch the real database and don't break when real content changes.
// Supports what the tested pages use: select with eq/in filters, offset/limit,
// single rows, and exact counts. Unknown tables return no rows.
import http from "node:http";

export const DECK_ID = "11111111-1111-4111-8111-111111111111";
export const TEST_ID = "33333333-3333-4333-8333-333333333333";

const cards = Array.from({ length: 5 }, (_, i) => ({
  id: `22222222-2222-4222-8222-00000000000${i}`,
  deck_id: DECK_ID,
  subject: "Rajasthan History",
  topic: "Forts",
  order_index: i,
  prompt: "Identify the fort",
  question: `Fort question ${i + 1}`,
  answer: `Fort answer ${i + 1}`,
  image_url: null,
  sections: [{ title: "Note", body: `Note ${i + 1}` }],
  created_at: "2026-01-01T00:00:00Z",
}));

const questions = Array.from({ length: 3 }, (_, i) => ({
  id: `44444444-4444-4444-8444-00000000000${i}`,
  test_id: TEST_ID,
  order_index: i,
  question: `Polity question ${i + 1}`,
  question_ext: "",
  image_url: null,
  option_1: `Option A${i + 1}`,
  option_2: `Option B${i + 1}`,
  option_3: `Option C${i + 1}`,
  option_4: `Option D${i + 1}`,
  answer: 2,
  explanation_sections: [{ title: "Why", body: `Because ${i + 1}` }],
  created_at: "2026-01-01T00:00:00Z",
}));

const tables = {
  home_settings: [
    {
      id: 1,
      cta_label: "",
      cta_subtitle: "",
      cta_url: "",
      cta_caption: "",
      lock_flashcards: false,
      lock_mcq: false,
      lock_mcq_practice: false,
      lock_saathi: false,
      lock_cta: false,
      hide_app_store: false,
      hide_google_play: false,
      hide_flashcards: false,
      hide_mcq_practice: false,
      hide_mcq: false,
      hide_saathi: false,
      hide_atlas: false,
    },
  ],
  home_banners: [],
  flashcard_decks: [
    {
      id: DECK_ID,
      name: "Rajasthan Forts",
      description: "Forts of Rajasthan for RAS",
      subject: "Rajasthan History",
      topic: "Forts",
      order_index: 0,
      is_public: true,
    },
  ],
  flashcards: cards,
  mcq_tests: [
    {
      id: TEST_ID,
      name: "Polity Test 1",
      description: "Three quick questions",
      order_index: 0,
      duration_seconds: 600,
      created_at: "2026-01-01T00:00:00Z",
      is_public: true,
    },
  ],
  mcq_questions: questions,
};

function filterRows(rows, params) {
  return rows.filter((row) =>
    [...params.entries()].every(([key, value]) => {
      if (["select", "order", "limit", "offset", "columns", "on_conflict"].includes(key))
        return true;
      if (value.startsWith("eq.")) return String(row[key]) === value.slice(3);
      if (value.startsWith("in.(")) {
        const list = value
          .slice(4, -1)
          .split(",")
          .map((s) => s.replace(/"/g, ""));
        return list.includes(String(row[key]));
      }
      return true;
    }),
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const rpcCalls = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/health") return send(res, 200, { ok: true });
  // Database function calls so far, for tests that check something was recorded.
  if (url.pathname === "/__rpc") return send(res, 200, rpcCalls);
  if (url.pathname.startsWith("/auth/")) return send(res, 200, {});
  if (!url.pathname.startsWith("/rest/v1/")) return send(res, 200, {});

  const name = url.pathname.slice("/rest/v1/".length);
  if (name.startsWith("rpc/")) {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      rpcCalls.push({ name: name.slice(4), args: body ? JSON.parse(body) : {} });
      send(res, 200, null);
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 201, []);

  let rows = filterRows(tables[name] ?? [], url.searchParams);
  const total = rows.length;
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = url.searchParams.get("limit");
  rows = rows.slice(offset, limit === null ? undefined : offset + Number(limit));
  const range = {
    "content-range": rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`,
  };

  if (req.method === "HEAD") {
    res.writeHead(200, range);
    return res.end();
  }
  if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) {
    if (rows.length !== 1) {
      return send(res, 406, {
        code: "PGRST116",
        details: `The result contains ${rows.length} rows`,
        message: "JSON object requested, multiple (or no) rows returned",
      });
    }
    return send(res, 200, rows[0], range);
  }
  return send(res, 200, rows, range);
});

const port = Number(process.env.MOCK_SUPABASE_PORT ?? 54321);
server.listen(port, "127.0.0.1", () => console.log(`Mock Supabase on http://127.0.0.1:${port}`));
