# Design System

> How FlashGyan should look and feel. The tokens live in `src/styles.css`; components in
> `src/components/ui`. Use these instead of inventing new values.

## Feel

Friendly, calm and focused: a study tool, not a dashboard. Soft pastel colours, rounded
shapes, frosted-glass headers, generous spacing. Built for a phone first: most students
use Android phones, often inside Telegram.

## Typography

| Use | Font | How |
| --- | --- | --- |
| Body, buttons, labels | Inter | Default (`font-sans`) |
| Page titles (`h1`, `h2`, `.display`) | Fraunces (serif) | Applied automatically to `h1` and `h2` |

- Hindi text uses the same fonts (the browser falls back to a Devanagari font). Set
  `lang="hi"` on Hindi blocks.
- Small labels above titles: `text-[11px] font-bold uppercase tracking-widest`.

## Colours

Always use the token classes (`bg-primary`, `text-muted-foreground`, …), never hex codes,
so dark mode works.

| Token | Light | Use |
| --- | --- | --- |
| `primary` | violet `oklch(0.55 0.22 295)` | Main buttons, links, highlights |
| `background` | soft lavender-white | Page background |
| `card` | white | Cards and sheets |
| `muted` / `muted-foreground` | pale lavender / grey-violet | Secondary surfaces and text |
| `success` | green | Correct answers, "Easy", positive actions |
| `warning` | amber | "Medium" |
| `destructive` | red | Wrong answers, "Hard", deleting |
| `border` | light lavender | Borders and inputs |

- Pastel gradients for feature cards: `grad-pink`, `grad-lavender`, `grad-peach`, `grad-mint`.
- Shadows: `shadow-soft` for cards.
- Dark mode values are defined under `.dark` in `styles.css`.
- **Exceptions:** atlas maps, magazines and image cards are printed or shared as images and
  use fixed colours on purpose. Keep those in their own components.

## Shape

- Base radius `--radius` is 1.25rem (20px). Use the Tailwind scale: `rounded-xl` (inputs,
  small buttons), `rounded-2xl` (buttons, list items), `rounded-3xl` (cards, dialogs).
- Avoid new one-off radii such as `rounded-[28px]`. Existing ones can stay until the page
  is next redesigned.

## Components

| Need | Use |
| --- | --- |
| Button | `Button` from `ui/button`: variants `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`; sizes `sm`, `default`, `lg`, `icon`. The default buttons have a raised bottom edge that presses down. |
| Dialog that needs a decision | `AlertDialog` |
| App download prompt | `AppDownloadPopup` (see AGENTS.md); never a new popup |
| Messages | `toast` from `sonner` (top centre) |
| Lists of decks or tests | `FlashcardsSection`, `McqSection`, `McqPracticeSection` and `FilterSelect` in `feature-sections.tsx` |
| Empty list | `EmptyState` in `feature-sections.tsx` |
| Admin pages | `AdminShell` sections (`admin-shell.tsx`) |

## Page patterns

**Student pages**
- Sticky header: `backdrop-blur-xl bg-background/70 border-b`, FlashGyan logo on the left
  linking home.
- Content column `max-w-2xl mx-auto px-5`; the homepage widens to `lg:max-w-6xl`.
- A "Back to …" pill link above the page title.
- Study screens (flashcards, MCQ) fill the screen (`h-dvh`) with the action buttons fixed at
  the bottom, within thumb reach.
- Rating colours are always Hard = destructive, Medium = warning, Easy = success.
- Atlas side cards (a district or a place beside the map): the name and one line of
  context, then one row of actions (Save and Share with labels, the rest as icon buttons with
  an accessible name, Report as a small flag), then tabs (Overview, Places by kind, Facts by
  chapter in sections that open). The open district is outlined on the map, and on screens
  without the side column a tap scrolls its card into view. Facts use `FactsList` /
  `DistrictTopics` (`atlas-ui.tsx`): table rows read as "Header: value" pairs and the
  report flag shows on hover or focus. A district's Facts tab follows the notes: topic
  (chapter) → subtopic → a card per heading (Biggaji, Rupnath Ji…) with all its facts, its
  "Also called / Where / Built" lines as a key-facts strip, tricks as a highlighted callout.
  A place block joins the heading it is about (Karni Mata's temple into Karni Mata), the same
  fact shows once, a heading's table keeps only the district's rows, a state-wide list row
  shows only the district's part ("Copper — Anjani"), and the district's name is picked out.
  The Places tab is built the same way: kind (the map's groups) → category → a card per place
  with its facts (key facts strip, its main points, "On the map"); the same place twice (the
  master map's and the notes') is one card, and places with no facts yet are compact chips.
  A place (its card beside the map and its own page) uses `PlaceFacts`: the place's own block
  in the notes as an "About" card (key facts strip, its labelled points), then its other facts
  by topic → subtopic → heading, then "Mentioned in the notes" with every topic folded; the
  notes' heading block about the same thing (Karni Mata for the Deshnok temple) is included.
  In Hindi mode the topics, subtopics, headings and table labels show in Hindi too (the
  `atlas_headings_hi` setting: from a subject's Hindi notes file at import, and the master
  map's translated by the background Hindi job).
- In a fact, the names of the places it is linked to are links (dotted underline, primary
  colour): on the map page they open the place's card beside the map, elsewhere its page.
  Only the first mention of each place in a line links, and a card doesn't link to itself.
- A district card's Facts tab lists its topics with counts at once; a topic's facts load the
  first time it is opened (grey placeholder lines while they come), and the Places tab's
  when that tab is opened.

**Admin pages:** dense and practical. Tables, forms and clear status; no decoration.

- Atlas data quality (admin): the Quality tab starts with "Duplicate places" (same name and
  kind in one district; pick the one to keep, then merge or say they're different). In the
  Facts tab each place link has a × to unlink it, and "to check" facts have "AI pre-check"
  (one at a time, or all not yet checked with a Stop button); the pre-check's line shows in
  blue under the notes' own doubt.

## Every screen needs

- **Loading state:** a skeleton or a short "Loading…" message in the right place.
- **Empty state:** say what is missing and what to do.
- **Error state:** a plain message and a way to retry or go home.
- **Phone width first** (375px), then tablet (768px) and desktop (1440px).
- **Both languages** where students see text: English and Hindi.
- **Accessible:** real `<button>` and `<a>` elements, `aria-label` on icon-only buttons,
  `alt` text on meaningful images, visible focus.
- **Inside Telegram:** respect safe areas (`env(safe-area-inset-bottom)`), open outside
  links with `openExternal` from `app-promo.ts`, and use `triggerHaptic` for feedback in
  study screens.

## Tone of writing

Short, warm and direct, addressed to "you". Say what happens next ("Study 5 more cards"),
not technical words ("Submit"). Hindi copy should read naturally, not as a word-for-word
translation.
