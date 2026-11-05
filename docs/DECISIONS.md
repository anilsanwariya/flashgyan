# Decisions

> Lasting technical decisions and why they were made, so they aren't undone by accident.
> To change one, add a new entry that replaces it; don't edit history.
>
> Entries 001–012 were written on 4 November 2026 from the code and Git history. Reasons
> marked *(inferred)* were not written down at the time; the owner should confirm them.

## ADR-001: Build with Lovable on TanStack Start, Supabase and Cloudflare

**Decision:** Lovable builds and hosts the site; the app is TanStack Start (React,
TypeScript, Tailwind); data, auth and files are in Supabase through Lovable Cloud.
**Reason** *(inferred)*: fast building without running servers; one place for database,
auth, storage and edge functions; server-side rendering for SEO and link previews.
**Consequence:** GitHub `main` syncs to Lovable. Never rewrite pushed history (AGENTS.md).

## ADR-002: Students have no accounts

**Decision:** Students use the website without signing in; progress stays on their device.
Only admins sign in, and there is no sign-up page.
**Reason** *(inferred)*: no friction for students; accounts and paid features belong to the
Android app; less personal data to protect.

## ADR-003: All data access goes through server functions

**Decision:** The browser never writes to the database directly. Public reads use the
anon key (so Row Level Security applies); admin work checks `assertAdmin()` and then uses
the service-role client.
**Reason:** one place to validate input and check permissions; secrets stay on the server.

## ADR-004: SAATHI answers only from FlashGyan's own material

**Decision:** SAATHI searches `saathi_knowledge` with hybrid search (embeddings plus
keywords) and answers only from what it finds, with sources. When nothing fits, it says so
and the question is logged as a knowledge gap.
**Reason** *(inferred)*: exam answers must be accurate and traceable; gaps show the team
what to add.

## ADR-005: Claude for AI text, Gemini for embeddings (October 2026)

**Decision:** All AI text goes through `saathiComplete` in `_shared/saathi-core.ts` to
Claude (`claude-sonnet-5`) with the project's Anthropic key. Embeddings use Google
`gemini-embedding-001` (1536 dimensions) directly with the project's Gemini key. Both
replaced calls through the Lovable AI gateway.
**Reason:** the git history mentions clearer errors from each service and a fallback for
search. Keeping the same embedding model and size avoided re-indexing.
**Consequence:** changing the embedding model means re-embedding all of `saathi_knowledge`.

## ADR-006: Prompt caching and AI cost tracking (30 October 2026)

**Decision:** A prompt's first system message is fixed (no dates, ids or per-call notes),
so Claude's prompt cache applies. Every call records its tokens in `ai_usage`, shown in
Admin → AI usage.
**Reason:** AI is the main running cost; cached instructions cost about a tenth.

## ADR-007: One edge function runs the whole Telegram bot

**Decision:** `telegram-demo-bot` handles every Telegram update and scheduled bot task.
Shared logic lives in `supabase/functions/_shared` and is also used by the website.
**Reason** *(inferred)*: one webhook and one deployment; the bot and site give the same
answers.
**Consequence:** a single startup error takes the whole bot down. The duplicate
`QUIZ_LIMIT` declaration did exactly that from about 13 July to October 2026. Check the
function URL shows `ok` after every deploy.

## ADR-008: The bot replies at once and does slow AI work in the background (14 October 2026)

**Decision:** Slow AI replies (Mains answers and `/check` marking) are acknowledged
immediately and finished as bounded `EdgeRuntime.waitUntil` jobs. Aborted jobs don't send
late messages.
**Reason:** slow AI calls held the webhook open, and Telegram retries a webhook that doesn't
answer in time, which risked late duplicate replies.

## ADR-009: The Telegram webhook requires a secret token (14 October 2026)

**Decision:** Admin → Telegram bot → Connection registers the webhook with a secret, and
the bot rejects requests without Telegram's secret header.
**Reason:** the function URL is public; without the secret anyone could pretend to be
Telegram.
**Consequence:** until a secret is set in that panel, the bot accepts every request. Make
sure the panel shows the webhook as secured.

## ADR-010: Scheduled work uses `pg_cron` calling safe "tick" endpoints (14 October 2026)

**Decision:** `pg_cron` calls `/api/ca/tick` and the bot's `?task=broadcast` every minute.
Each call does only work that is already due, so it needs no credentials.
**Reason:** works without a separate job server, and runs even when no admin has the page
open.
**Consequence:** the schedules are set up by running SQL shown in the admin panels. They
are not in the migrations, so remember them if the database is ever rebuilt.

## ADR-011: Public AI endpoints are rate-limited per IP and site-wide (13 October 2026)

**Decision:** SAATHI, answer checking, quizzes, feedback and atlas reports go through
`saathi_consume_rate_limit`.
**Reason:** these are public and cost money per call.

## ADR-012: The website promotes the Android app through one module (12 October 2026)

**Decision:** Every Play Store link goes through `src/lib/app-promo.ts`, tagged with where
it was shown, and download prompts show at most once a day and never on iPhones.
**Reason:** measure which placements bring installs; open the Play Store correctly inside
Telegram; avoid annoying students.

## ADR-013: Count finished practice sessions on the server, anonymously (4 November 2026)

**Decision:** The north-star number (practice sessions finished each day) is counted in
`practice_sessions_daily` by day and kind, through a public, rate-limited server function
called when a session reaches its summary or result page. Each browser tab counts a session
once, so reloading doesn't add to it. No student is identified.
**Reason:** sessions run entirely in the browser, so nothing recorded them, and Google
Analytics is optional and off. A server count works without analytics or cookies.
**Consequence:** someone scripting the endpoint could add up to 60 sessions an hour from
one address; treat sudden spikes with care.

## ADR-014: Admins sign in with an authenticator-app code (5 November 2026)

**Decision:** Admin sign-in needs the password and a TOTP code from an authenticator app.
Admins without one must set one up before `/admin` opens. Once an account has a verified
authenticator, password-only sessions (`aal1`) are refused by every admin server function
(`requireAdminMfa()` in `assertAdmin()`) and by the database's `has_role`.
**Reason:** an admin can change everything, and a leaked password alone was enough. Admin
sessions live in `localStorage`, so a stolen session is also short-lived without the code.
**Consequence:** the rule follows Supabase's recommendation (required once an authenticator
exists) so that a project with two-factor switched off doesn't lock the admin out; the
sign-in page explains how to switch it on. Losing every authenticator needs one SQL line
(see SECURITY.md); a backup authenticator avoids that.

## ADR-015: Subject notes are imported as two aligned files, with approximate pins (6 November 2026)

**Decision:** A subject's notes are imported from the English and the Hindi markdown files
together, paired line by line, and refused if any line differs in shape. Places in the
notes, which carry no positions, are pinned at their village or town from the surveyed
place list (only within their own district) and marked approximate. When the list doesn't
have them, they are held at the district headquarters, hidden from students until placed.
**Reason:** the Hindi is the editor's own, not machine translation, and pairing by line
needs no AI. Approximate pins put the places on the map at once while keeping every one on
the position checks list to correct.
**Consequence:** the extraction project must keep the Hindi file's lines exactly parallel
to the English one. An approximate pin can be a nearby look-alike village, so its note
says where it was pinned.

## ADR-016: Atlas link fixes are remembered as settings and replayed on every import (5 November 2026)

**Decision:** When the editor merges duplicate places, or unlinks a fact from a place it
isn't about, the change is made in the tables and also recorded in `bot_settings`
(`atlas_place_merged`: dropped place → kept place; `atlas_unlinked`: fact key → place keys;
`atlas_place_apart`: pairs that only look alike). Both importers (the master map and a
subject's notes) pass every fact's links through these before saving, and a merged place
from the notes joins the kept one instead of coming back. A merged place is hidden, not
deleted, with "Merged into …" above its own note.
**Reason:** the files are imported again whenever they're corrected, and the importer
would otherwise restore every link the editor removed. Settings need no migration, and
the lists stay small.
**Consequence:** to undo a merge, show the hidden place again and remove its line from
`atlas_place_merged`. The AI pre-check of "to check" facts only writes a line into the
fact's note ("AI pre-check: …"); deciding stays with the editor.

## ADR-017: Place photos come from Wikimedia Commons, free licences only, shown with credit (5 November 2026)

**Decision:** The editor chooses each place's photo from Wikimedia Commons in the atlas's
Photos tab. Only public-domain, CC0, CC BY and CC BY-SA files are offered (no NC or ND
licences, no restricted files, only JPEG, PNG or WebP). The server reads the chosen file's
details from Commons again and saves them in `bot_settings` (`atlas_photos`). Students see
Commons' thumbnail with the author, the licence (linked) and a link to the file.
**Reason:** a photo makes a place memorable, Commons has free photos of most of Rajasthan's
sites, and its licences allow reuse with attribution. Linking the thumbnail costs no
storage. Reading the details back from Commons means the credit is always Commons' own.
**Consequence:** if a file is deleted or renamed on Commons, its photo stops loading and
the card hides it. The editor chooses another from the Photos tab.
