# Product Requirements: FlashGyan

> Drafted on 4 November 2026 from the code as it is. The owner should check the parts
> marked **Owner** (goals, priorities and success measures), which code cannot show.

## Product

FlashGyan helps students prepare for **Rajasthan state competitive exams**, set by RPSC
and RSSB: RAS, REET, PSI, Patwari and others. Content is in English and Hindi.

It has four parts:

| Part | Who uses it | Where |
| --- | --- | --- |
| Android app (`com.flashgyan`) | Students | Google Play; separate repository |
| Website | Students | www.flashgyan.com (this repository) |
| Telegram bot and channel | Students | Telegram; bot in this repository; the website links to @RASbandhu |
| Admin tools | The FlashGyan team | `/admin` on the website |

## Problem

Students preparing for these exams mostly read PDFs and coaching notes passively, follow
current affairs from scattered sources, and rarely get feedback on Mains answer writing.
Good material in Hindi is hard to find.

## Users

- **Aspirants for Rajasthan state exams**, mostly on Android phones, many studying in
  Hindi, many arriving through Telegram.
- **The FlashGyan content team** (admins), who turn books, newspapers and past papers
  into cards, quizzes, magazines and the atlas.

## North star

**Goal:** exam aspirants master what RAS, PSI and other state exams ask.
**Metric:** practice sessions completed to their summary page each day.
(Set by the owner in Lovable on 4 November 2026; also in `.lovable/north-star/north-star.md`.)

Counted since 4 November 2026 in **Admin → System → Practice sessions**, by day and by kind:
flashcards and MCQ practice when they reach the summary page, MCQ tests when they reach
the result page. Each session counts once; no student is identified.

## Goals

1. Let students study effectively for free on the website and in Telegram.
2. Bring students to the Android app (paid Premium, through Google Play subscriptions).
3. Let a small team produce a large amount of accurate, bilingual exam content with AI help.

**Owner:** confirm the order of these goals and add targets (e.g. sessions per day, installs per month).

## Features: students

| Feature | What it does | Route |
| --- | --- | --- |
| Homepage | Pitch, app download, 5-card demo, feature picker | `/` |
| Flashcards | Decks by subject and topic; flip and rate recall; summary | `/flashcards`, `/practice/$deckId`, `/decks/$deckId` |
| MCQ practice | Questions with instant feedback and explanations | `/mcq-practice`, `/practice-mcq/$testId` |
| MCQ tests | Timed tests, marked +1 / −⅓, with review | `/mcq-tests`, `/mcq/$testId` |
| SAATHI | AI study assistant that answers **only** from FlashGyan's study material, with sources; also marks Mains answers (typed or photos) | `/saathi` |
| Rajasthan Atlas | Interactive map: districts, places, themes, quizzes, drills, daily challenge, compare, then and now, one-page sheets, revision cards | `/atlas/...` |
| Telegram bot | Flashcards, MCQ quizzes, daily quiz with streaks, `/ask` (SAATHI), `/answer`, `/check` (answer marking), admin-defined commands | Telegram |
| Telegram channel | Daily current affairs magazine, quizzes, image cards | Set in Admin → Magazine settings |

Students have **no accounts** on the website. Progress is kept on their device. Inside
the Telegram Mini App they are identified by their Telegram account.

## Features: admins

| Area | What it does |
| --- | --- |
| Home page | Banners, call to action, which features show or are locked |
| Flashcards, MCQ tests, MCQ practice | Create and edit content |
| Card studio | Build decks from several books: proofread, split, export to the app |
| Rajasthan atlas | Places, facts, layers, district overviews, reports from students |
| SAATHI | Knowledge base it answers from; model answers for Mains |
| Current affairs | Daily, monthly and custom bilingual magazines; collection from news sites; Words in the News and GK image cards; scheme register |
| Syllabus and exam papers | Official syllabi; RPSC/RSSB past papers with answer keys, as a question bank exported to the app |
| Telegram bot | Broadcasts, commands, auto-replies, stats, users, webhook connection |
| System | AI usage and cost |

## Out of scope for the website

- Paid features and payments: these live in the Android app.
- Student accounts and sign-up.
- An iOS app (the homepage says "coming soon").

**Owner:** confirm, and add anything else that should not be built.

## Success criteria

A student can, without signing in:

1. Open the homepage and finish the 5-card demo.
2. Study a flashcard deck and see a summary.
3. Take a timed MCQ test and see the result with explanations.
4. Ask SAATHI a question and get an answer with sources, or a clear "not in my material".
5. Explore the atlas and play a map quiz.
6. Reach the Play Store from every completion screen.

In Telegram, a student can start the bot, take a 5-question quiz and ask `/ask`.

**Owner:** add business measures, e.g. app installs from the website, bot users, channel
subscribers, daily SAATHI questions.
