# Security

> How FlashGyan is protected, and the rules every change must keep. If a change touches
> sign-in, admin rights, database policies, secrets or a public endpoint, re-read this file.

## Who can do what

| Who | How they are identified | Can |
| --- | --- | --- |
| Visitor or student | Nobody (no account) | Read published study content; use SAATHI and public endpoints within rate limits |
| Telegram Mini App user | Telegram's signed `initData`, checked on the server with the bot token (`telegram-init-data.server.ts`) | The same as a student; recorded in `profiles` |
| Telegram bot user | Telegram (`chat_id`) | Bot features; admin-only bot commands check the user |
| Admin | Supabase Auth email and password, plus an `admin` row in `user_roles` | Everything in `/admin` |

There is no sign-up page. The project owner creates admin accounts. Sign-ups should also be
turned off in Supabase Auth (see **Open questions**).

## Rules

### Authentication and authorization

- `/_authenticated` (the admin area) only checks that **someone** is signed in. Admin
  rights must be checked **in every admin server function** with `assertAdmin()` (or the
  `has_role` database function). **An admin function without that check is open to anyone
  who can sign in.**
- Admin server functions use the `requireSupabaseAuth` middleware, then `assertAdmin()`,
  then the service-role client. Never use the service-role client before that check.
- Never trust the browser to hide or lock a feature; check on the server.

### Database

- Every table has Row Level Security enabled (93 of 93 across both migration folders,
  checked on 4 November 2026). Every new table must enable it in the same migration.
- Public reads use the anon key so policies apply. Writes go through server functions.
- Policies use `has_role(auth.uid(), 'admin')`; that function is not callable by the
  public.
- Public catalog reads require the parent's `is_public` flag, and study image buckets are
  private with signed URLs (`drizzle/migrations/0001`–`0003`; see AGENTS.md).

### Secrets

- Secrets live only in Lovable Cloud secrets; see `.env.example` for the list.
- `.env` is committed and holds only the public Supabase URL and publishable key, which
  are designed to be public.
- Never import `client.server.ts` or any `*.server.ts` file from browser code, and never
  read a secret in a component.
- Never log tokens, keys or full Telegram `initData`.
- A full search of the code and Git history on 4 November 2026 found no committed secrets.

### Public endpoints

These are deliberately public. Each validates its input with `zod`; abuse is limited per
IP and site-wide through `saathi_consume_rate_limit`.

| Endpoint | Limit |
| --- | --- |
| SAATHI ask and check (`/api/saathi/ask`, `/api/saathi/check`), `saathiQuiz`, `submitSaathiFeedback` | Per IP and site-wide |
| `reportAtlasMistake` | 8 per IP per hour |
| `atlasUsageFn` | 120 per IP per hour |
| `recordPracticeSession` (finished-session count) | 60 per IP per hour, 200,000 a day site-wide |
| `/api/ca/tick` and the bot's `?task=broadcast` | Do only work that is already due; safe to call without credentials |
| Telegram webhook | Checks Telegram's `X-Telegram-Bot-Api-Secret-Token` header once a secret is set in Admin → Telegram bot → Connection; **accepts everything until then** |

A new public endpoint needs input validation **and** a rate limit, especially if it calls AI.

### Uploads

- Student photos sent to `/check` in Telegram: images only, at most 4.5 MB
  (`telegram-check-input.ts`).
- Admin uploads in current affairs, exam papers and card studio limit size and type.
  Some older admin uploads (flashcard, MCQ and banner images, bot media, SAATHI PDFs) check
  only that a file is present. They are admin-only, so the risk is low, but add a size and
  type limit when touching them.

### AI

- SAATHI answers only from `saathi_knowledge` and says so when the material has no answer.
- Treat student questions and uploaded documents as untrusted text; never let them change
  instructions or reach admin tools.
- AI costs are visible in Admin → System → AI usage. Rate limits protect the budget.

## Open questions (owner to resolve)

1. **`is_public` has no controls yet.** The security rules require it, but no code reads or
   sets it: everything defaults to public and admins can't unpublish. (Migrations: Lovable's
   are in `drizzle/migrations/`; ones added outside Lovable must be run by hand in Lovable's
   SQL editor. See ARCHITECTURE.md → Database changes.)
2. **No monitoring for outages.** The Telegram bot was down from about 13 July to October
   2026 without anyone noticing. Add an uptime check on the website and on the bot's
   function URL.
3. **Lint is not checked automatically.** Since 4 November 2026 GitHub checks every pull
   request and push to `main` (type check, build, bot tests, bot start-up), but lint is left
   out until the ~4,800 existing formatting warnings are cleaned up.
4. **Confirm that new sign-ups are turned off** in Supabase Auth settings. The website has
   no sign-up page, but the Supabase sign-up API still accepts new accounts unless sign-ups
   are disabled there, and any account passes the admin area's sign-in check. (The one admin
   function that lacked an admin check, `parsePdfWithLlama`, was fixed on 4 November 2026.)

## Before every release

- [ ] No secrets in the diff
- [ ] New tables have Row Level Security and policies
- [ ] New admin functions call `assertAdmin()`
- [ ] New public endpoints validate input and are rate-limited
- [ ] The GitHub "Checks" are green
- [ ] If the bot changed: redeployed, and its URL shows `ok`
