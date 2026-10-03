## Goal

Add a bilingual, highly visual “Why FlashGyan?” experience to the homepage without changing the existing feature flows or homepage layout above it.

## Homepage entry point

- Add a secondary outlined “Why FlashGyan?” button beneath the existing app-download/CTA area.
- Smooth-scroll that button to a new `#why-flashgyan` section below the four feature cards.
- Keep the current mobile, tablet, and desktop structure intact; the new button will follow the existing responsive left-column alignment.

## Bilingual section

- Add local English/Hindi state, defaulting to English.
- Place an accessible EN/HI segmented toggle at the top-right of the new section.
- Switch every new heading, description, step label, and mock-card caption together using the exact supplied English and Hindi copy.
- Use semantic buttons with clear selected state and update the section language attribute for assistive technology.

## “The Science of Learning” cards

- Build a responsive 1-column mobile, 2-column tablet, and 3-column desktop grid.
- Add three distinct Lucide-led cards for Active Recall, Spaced Repetition, and Exam Focus.
- Match the homepage’s existing pastel surfaces, icon badges, soft shadows, typography, and theme tokens rather than introducing a separate visual language.

## “How FlashGyan Works” walkthrough

- Add three responsive steps: Test Yourself, Flip & Review, and Swipe & Master.
- Create lightweight visual mockups of the actual learning flow: question card, revealed answer card, and Hard/Good/Easy rating controls.
- Use subtle CSS hover/lift/flip cues on pointer devices, while keeping all content visible and honoring reduced-motion preferences.

## Technical details

- Keep the implementation within `src/routes/index.tsx`, extracting small local components/data maps where useful.
- Use the existing design-system `Button` for the jump link and language control rather than raw buttons.
- Use only semantic theme classes and existing tokens; no database, auth, server-function, routing, or global-theme changes.
- Complete the index route’s social metadata fields while touching the route, preserving its current title and description intent.

## Verification

- Check the homepage at mobile and desktop widths for readable Hindi text, no overflow, and correct placement below all four features.
- Verify the jump button scrolls to the section, EN/HI switches all content, and interactive mockups do not affect real study data.
- Confirm the preview builds cleanly and has no new browser errors.
