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

**Decision:** `pg_cron` calls `/api/ca/tick` and the bot's `?task=broadcast` every minute
(the tick ran every 5 minutes from 12 to 13 November 2026; ADR-022 has how quiet minutes
are kept cheap instead).
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
`atlas_place_merged`. The Proofread tab follows the same rule: tags it adds are kept in
`atlas_linked` (fact key → entities), tags it removes in `atlas_unlinked`, and facts it
deletes in `atlas_fact_deleted` (their keys), so neither importer brings them back; a
place made while proofreading is pinned at its district's centre with the approximate
note, so it appears in the position checks. The AI pre-check of "to check" facts only writes a line into the
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

## ADR-018: Words in the News cards use exam-style sentences and post to several channels by language (6 November 2026)

**Decision:** The AI writing a Words in the News card also writes its example sentence: one
general, timeless sentence in the way RPSC, RSSB and SSC papers use the word, with no
names, places, organisations, dates or numbers from the news, and its Hindi. The card
labels it "Exam-style sentence" with a small "Spotted in <paper>" line. The paper's own
line is still offered in the card editor ("Use the paper's line instead"), and a card
whose AI gave no sentence keeps the paper's line as before. Settings hold a list of
Telegram channels, each with its languages (English, Hindi or both), its own caption
template if wanted, and an on/off switch; one posting time serves them all. Each channel
gets an album (or two, English then Hindi, when it takes more than 10 cards) of only its
languages' cards, with its own caption, and the weekly PDF is made once per language set
and sent to each channel. With one channel the card footer shows its link; with several,
a neutral "FlashGyan app". From 13 November 2026 each language numbers its own cards ("Word 1 of 3",
"शब्द 1 / 2"); cards made before keep the day-wide count they were made with. From 22
November 2026 English and Hindi cards can each have their own design: Settings hold
`design` (English) and `design_hi` (read as the English one when missing), and a day keeps
both in its one `design` field as `english|hindi` (a single name when they match, as every
older day has), so no migration; changing one language's design for a day remakes only
that language's images.
**Reason:** a line copied from the news teaches the news, not how the word appears in an
exam, and goes stale. Separate Hindi and English channels let each audience get only the
words it reads.
**Consequence:** no migration. The channels live in the `ig_settings` value (the old single
`channel` is read as one channel taking both languages, and kept equal to the first one
for older code). Each day's per-channel captions and results are kept in `bot_settings`
under `ig_posts:<day>`, and each week's in its `ig_week:<date>` mark, so trying a failed
post again sends only to the channels that failed. The settings page saves the daily and
weekly Play Store links (`daily_app_link`, `weekly_app_link`) through `app-promo.ts`,
because the server can't import it.

## ADR-019: Words in the News images are made as cards are checked, and posting runs without the page (6 November 2026)

**Decision:** Ticking a card "Checked" shows at once and is saved behind any edit still
saving; "Check & next" (Alt+C) ticks it and opens the next unchecked card. A checked
card's image is made in the background while the rest are checked: by the open page,
or by the minute tick when it is closed. An image is kept only if its card wasn't
changed while it was made, and an edit unticks the card and drops its image. After
approving, the editor can close the tab: the minute tick makes the images left, a
few at once, and posts when due, in the same tick if it is already due. Words in the
News runs first in the tick. The admin chat gets a Telegram message when the cards are
posted and each time posting fails. Changing the footer (the channels) or the
watermark in Settings makes the images of days not yet posted again.
**Reason:** waiting for each tick to save, and for every image after approving, made
reviewing slow and kept the editor on the page until the album was posted.
**Consequence:** a card edited after checking is made twice (a little more Cloudflare
use). Approving no longer remakes images; the settings change above does that instead.

## ADR-020: Background AI jobs nobody waits on go through Message Batches, with a model and effort per job (7 November 2026)

**Decision:** `saathiComplete` takes per-call options (model, effort, length limit) and
reports each call's tokens; left out, a call runs as before. `saathi-core.ts` can also send
calls as one Anthropic Message Batch (half price on every token, replies within 24 hours,
most within an hour) and read the replies; each reply is recorded on the AI usage page as
a call of `<model>:batch`, priced at half. The atlas Hindi translation is the first job
moved: it sends up to 60 chunks (about 600 facts) as one batch, the minute tick collects
the replies while the rest of the atlas work goes on, and a batch whose calls all fail
counts towards the existing three-tries stop. The Overview tab sets the translation's model
(Claude Sonnet 5 or Claude Haiku 5.5) and effort (kept in `bot_settings`, `ai_jobs`),
switches batches off (a chunk a minute, full price) and runs a side-by-side test: up to 10
facts with Hindi a person wrote or checked are translated again with each choice, shown
beside that Hindi with what each cost and what 1,000 facts would cost as a batch.
**Reason:** from 15 October to 6 November 2026, output tokens were 79% of the Claude bill
and the atlas translation alone was 85% of what the AI usage page recorded, all of it
background work nobody waited for. The same models through a batch cost half; a cheaper
model or lower effort is a quality trade the admin decides from the test.
**Consequence:** no migration. Students and editors wait on nothing new: SAATHI, the
Telegram bot and the editors call the API as before. Translated Hindi now arrives in
batches rather than a chunk a minute. Other background jobs (exam-paper reading, card
studio checks) can move to batches the same way.

## ADR-021: Card studio server jobs and the exam upload queue use Message Batches, with the step run twice (7 November 2026)

**Decision:** An existing AI step (check these cards, fill these explanations, read this
page) takes an optional way of calling the AI (`src/lib/ai-batch.server.ts`). To batch it,
the step runs once with `captureCall`, which catches the request it would send so it goes
into a Message Batch, and once more after the batch has ended, with `replayReply`, which
hands back the batch's reply. The reply is used only if the request's last user message
(the cards or page it is about) is unchanged; otherwise the step throws `StaleReply` and
those cards go in the next batch. Card studio server jobs send 25 parts (500 cards to check,
or 250 to fill) as one batch. The exam upload queue sends an objective paper's next 30
pages; written (Mains) papers are still read page by page, because each page carries on
from the one before. While a batch is out, the job or paper is left alone for a few
minutes so other work goes on. Admin → AI usage has a switch for each (on by default).
**Reason:** these jobs run with nobody waiting, and a batch costs half on every token. Running
the step twice keeps each job's own request-building and saving code as the only copy, so
batched and direct runs can't drift apart.
**Consequence:** no migration. Results arrive within hours instead of minutes; the switch
turns batching off for a job when results are needed sooner. Pending batches are kept in
`bot_settings` (`flash_job_batch:<job>`, `exam_queue_batch:<item>`); stopping a job,
removing a queued paper or trying it again drops its batch.

## ADR-022: The tick runs every minute, but quiet minutes do only the parts with work (13 November 2026)

**Decision:** The schedule calls `/api/ca/tick` every minute. Every fifth minute (by the
clock) is a full tick: every part runs, as before. In the minutes between, the tick first asks
a few cheap questions in parallel: a Telegram "Approve" waiting, a news collection running, a
Words in the News or GK day writing, making images or due to post, a card studio job or exam
paper queued (not held by another tick), a clipped newspaper in progress. It runs only those
parts, plus the parts without a question of their own (past-date collection, custom
magazines, official documents, scheme register, atlas) that did something on the last tick
(kept in `bot_settings`, `tick_busy`). A question that fails counts as "busy". Timed work
with no question (the evening collection starting, the weekly report, the atlas daily poll)
runs on full ticks. Rules in `src/lib/tick-gate.ts`, reads in `tick-gate.server.ts`.
**Reason:** running the tick every 5 minutes (12 November) cut its cost but made every
background job about five times slower with the page closed (a collection does 15 seconds of
work per tick) and let posts run up to 5 minutes late. A quiet minute now costs 8 small reads
instead of about 30, and work in progress moves every minute.
**Consequence:** nothing runs later than it would have on the 5-minute schedule; anything in
progress runs every minute. Work that starts without a question (a custom magazine just
created, the atlas jobs) can wait up to 5 minutes for its first step. The owner re-runs the
schedule SQL shown in Admin → Current affairs → Websites to watch (it now says every minute).


## ADR-023: Card studio AI writes onto the card as it is now, and a job step holds its job (25 November 2026)

**Decision:** The AI fill and check read the cards, wait for the AI, then read them again
before saving. A column the editor changed meanwhile keeps the editor's text
(`mergeFilled`); a card whose text changed is left for the next check, and a note or mark
set meanwhile stays. "Apply AI fixes" (one card or many) applies a fix only while its field
still reads as the AI saw it (`fixFits`). A server job step claims its job for 10 minutes
(longer than a step takes) and saves its progress only while that claim is still its own,
so two ticks never run one job. A batch that can't be read counts as a failed step (three
stop the job with the reason), stopping a job cancels its batch, and a batch made after
the job was stopped is cancelled. A forced re-check marks its cards unread before the job
exists. One open job of each kind per topic is kept by a unique index. The fill and check
prompts keep their first system message the same for a deck (the examples, house
spellings, dictionary lines and hints go in a second one), so prompt caching hits.
Replacing a sheet checks the new one before the old one is deleted.
**Reason:** an AI call takes seconds to minutes, and the editor keeps working meanwhile;
writing from the copy read before the call silently undid their edits.
**Consequence:** migration `20261227090000_flash_jobs_one_open.sql` (safe to re-run; it stops
any duplicate open jobs first). Until it runs, the code's own check still refuses a second
job, only not under a double click. A tick that dies mid-step leaves its job for up to 10
minutes before another takes it.

## ADR-024: Daily magazine work is claimed, guarded and recoverable (26 November 2026)

**Decision:**
- **Posting:** an issue left "posting" for 10 minutes (the bot stopped mid-post) is taken
  again by `ca_claim_due_issue`, sending only the editions whose message id isn't saved yet;
  the page offers "Post again" or "Cancel" for it.
- **Approving:** each approval's PDFs go in a folder of their own (`daily/v<time>/…`, file
  names unchanged for the channel), and the issue is saved only if it wasn't posted
  meanwhile; the last approval's files are then removed.
- **Corrections:** a correction is claimed while pending before it is applied, so its
  channel note goes once.
- **Writing:** the story writer saves only if the story is unchanged since it read it; new
  facts merged meanwhile leave it to be written again on the next tick. Steps after the
  save (versions, corrections, "Asked before", history) only log their failures.
- **Reading sources:** an AI reply that can't be read marks the source as failed instead
  of dropping that part.
- **Collecting news:** a run is claimed for 10 minutes and released only by its own tick.
  LlamaParse calls time out, and a PDF still unparsed after 20 minutes gives up even when
  asking keeps failing. A failed read stops the step instead of ending the run.
- **Merging stories:** pending corrections follow their facts by text when stories merge.
- **Editor:** the story editor saves one change at a time on the latest content.

**Reason:** these paths could post twice, post a stale PDF, leave an issue stuck with no way
out, or silently undo facts and edits.
**Consequence:** migration `20261228090000_ca_issue_stale_posting.sql` (safe to re-run).
Until it runs, a stuck issue is recovered by hand with "Post again" or "Cancel" on the
page.

## ADR-025: The daily issue goes to the channel as story cards for phones, A4 linked for printing (26 November 2026)

**Decision:** Students read the daily issue on their phones. The A4 page shrinks to about
5pt text on a phone screen, so they had to zoom on every line or print it.

The channel now gets a phone edition made from the same stories and the same HTML:
- **Page:** a 105 × 187 mm page (a phone screen's shape), one column, 12pt body text and
  darker greys.
- **Cards:** each story is a card on a page of its own, as tall as the story needs and never
  shorter than a screen, so text is never shrunk to fit. Its section (Rajasthan, National…)
  and its number ("1 / 5") are in small letters at the top of the card.
- **Cover and contents:** the cover keeps the title, date and counts. A contents page
  after it lists every story (section, number and headline) and the pages after the
  stories, each a link, and "↑" on each card links back to it. A Side Band or Top Story
  First cover is printed as Classic in the phone edition, because it doesn't fit a narrow
  page; the A4 issue keeps its design.
- **Visuals:** they print in one column with their words at reading size (flow charts run
  top to bottom, tables at 10.5pt).
- **Revising from a card:**
  - exam facts (amounts, numbers with their units, dates) are bold, marked by the phone
    script with no AI;
  - each section has its own colour on its cards' top edge, label and number;
  - the story's one-liner and its MCQ are not repeated on the card (they read as the
    same facts again); the MCQs stay on the practice page;
  - the source line moves to the bottom of the card, small.
- **Space:** the cards use small page margins (4 mm top, 3 mm sides, 8 mm bottom for the
  footer and the Telegram link). The Exam Angle box is left out on cards (it took a box on
  every story); the A4 issue keeps it.
- **Caption:** it links the A4 issue ("Printable A4 PDF"), stored beside the cards PDF as
  `…-A4.pdf`.
- **Setting:** Magazine settings → Channel has "Daily issue posted as" (story cards, or A4
  only). Monthly and custom magazines stay A4.

**How:** `renderMagazine({ edition: "phone" })` adds the phone styles and a short script.
The script sizes each card's page (a CSS named page per story, measured once the fonts
have loaded); Chrome prints pages of different sizes in one PDF.

**Reason:** a card per story reads like a feed, with no zooming, and printing stays one
tap away.

**Consequence:** no migration. Approving makes four PDFs instead of two (cards and A4,
in each language), so it takes about twice as long.
