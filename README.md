# FlashGyan

Exam preparation for Rajasthan state competitive exams (RAS, REET, PSI, Patwari and other
RPSC/RSSB exams), in English and Hindi. This repository is the **website**
(www.flashgyan.com), the **admin tools** that produce study content, and the
**Telegram bot**. The Android app (`com.flashgyan`) lives in a separate repository; this
site promotes it and exports content for it.

Built and hosted with [Lovable](https://lovable.dev), connected to this GitHub repository.

## Documentation

Read these before changing the project. AI assistants (Lovable, Claude) should read them
at the start of every task.

| File | What it answers |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | What are we building, for whom, and why? |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How does it work, and where does code go? |
| [docs/DESIGN.md](docs/DESIGN.md) | How should it look and feel? |
| [docs/SECURITY.md](docs/SECURITY.md) | How is it protected? |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why was it built this way? |
| [AGENTS.md](AGENTS.md) | Specific rules AI assistants must follow in this codebase |
| [roadmap.md](roadmap.md) | Current work |

## Running it locally

Requirements: Node.js 22 and npm (or Bun).

```sh
npm install
npm run dev        # http://localhost:8080
```

`.env` (committed, managed by Lovable) holds the public Supabase settings. Server-only
secrets are not in Git; see [.env.example](.env.example) for the full list and where each
one is set. Without them the public pages work, and the AI, Telegram and admin features
show a "not configured" error.

## Checks before merging

GitHub runs these automatically on every pull request and every push to `main`
([.github/workflows/checks.yml](.github/workflows/checks.yml)). Don't merge while a check
is red.

| Check | What it catches |
| --- | --- |
| Website: type check | TypeScript errors |
| Website: build | A site that won't build |
| Telegram bot: tests | Broken shared bot logic |
| Telegram bot: starts | A bot that crashes on start-up (the July 2026 outage) |
| Browser tests | Broken student journeys: homepage and demo, a flashcard session, a timed MCQ test with its score, deck pages and the sitemap, on an Android phone and a desktop |

The checks install the exact package versions in `bun.lock`, which is what Lovable builds
with. To run the same checks yourself:

```sh
npx tsc --noEmit                                    # type check
npm run build                                       # production build
deno test --allow-all supabase/functions/_shared/   # bot tests
npm run lint   # not in CI yet: ~4,800 existing formatting warnings; add no new non-formatting ones
```

### Browser tests

The browser tests in `e2e/` run the site against a fake Supabase (`e2e/mock-supabase.mjs`)
with fixed sample data, so they never touch real data, AI or Telegram. They have their own
`package.json`, so the app's dependencies are untouched.

```sh
cd e2e
npm ci
npx playwright install chromium   # once
npx playwright test               # starts the fake database and the site itself
```

When you change one of the tested journeys, update its test in `e2e/tests/` in the same
change. When a tested page reads a new table, add sample rows to `mock-supabase.mjs`.

## Deploying

- **Website:** Lovable builds and publishes it. Changes merged into `main` sync to Lovable.
- **Database:** add a new file to `supabase/migrations/`; never edit one that has already run.
- **Telegram bot** (`supabase/functions/telegram-demo-bot`): merging on GitHub does **not**
  redeploy it. Ask Lovable to redeploy the function, then open
  `https://ueldzqtaqepehyeivppm.supabase.co/functions/v1/telegram-demo-bot`; it must show `ok`.
  `BOOT_ERROR` means the deployed code does not start.

## Contact

FlashGyan EdTech LLP · flashgyanedtech@gmail.com
