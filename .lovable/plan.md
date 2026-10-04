## Goal
Replace the three static “How FlashGyan Works” examples with one functional flashcard experience that uses five random cards from the uploaded FlashGyan library on each fresh page load.

## Homepage card experience
- Keep the existing “Why FlashGyan?” section, science cards, language toggle, and surrounding homepage layout unchanged.
- Replace the three-column walkthrough with one centered card and a compact `1 of 5` progress indicator.
- Match the real Flashcards experience: show the card prompt and question first, tap “Reveal Answer” to flip it, then show the answer, image when available, and every explanation section.
- After revealing, show Hard, Medium, and Easy controls using the same visual states and interaction pattern as flashcard practice.
- Selecting a rating immediately advances to the next card with the same flip/transition feel as the real feature.
- After the fifth rating, keep the card area in a completed state with a simple five-card rating summary; do not redirect or start another set.
- Keep interface labels bilingual through the existing EN/HI toggle. Uploaded card content remains in its stored language.

## Random card data
- Add a public server function that returns up to five unique random cards from across all uploaded flashcard decks/topics.
- Include prompt, question, answer, optional image, and explanation sections so the preview is representative of the real feature.
- Generate a fresh randomized set for each new homepage load while keeping the selected five stable during that visit.
- Gracefully handle libraries containing fewer than five cards, including an empty-library message.

## Technical details
- Reuse the existing flashcard types, image URL signing behavior, Motion flip animation, scrollable card faces, and semantic theme styles where practical.
- Load the preview cards with the homepage data flow so the initial experience is complete and does not flash from placeholders to content.
- Keep this as a demo only: ratings will remain local to the homepage and will not create study sessions or change spaced-repetition history.

## Verification
- Confirm a fresh reload produces five unique cards drawn across the full uploaded library when at least five exist.
- Exercise reveal, answer/explanation scrolling, all three ratings, automatic advancement, progress, and the final summary.
- Check mobile and desktop layouts for a fully visible, usable single card with no overflow.
- Confirm EN/HI still switches all interface copy, and the preview builds without new browser errors.
