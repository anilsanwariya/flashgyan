# Claude Project: Rajasthan Atlas content extraction (subject by subject)

**The workflow:**
1. Work through a subject one chapter at a time, in syllabus order.
2. In a chat, attach every source for one chapter (authentic PDFs and coaching notes). Claude cleans them and merges them into one chapter file with no duplicates.
3. Attach the next chapter's sources in the same chat and repeat.
4. When the subject is complete, Claude combines the chapter files into one subject file, for example `Rajasthan-History.en.md`.
5. Upload the subject file to the atlas. Each place's detailed write-up goes to that place (fort, temple, lake…), so a student who taps it can read everything about it. The other facts go to their chapters, places and districts.

Copy each part below into the Claude Project:

| Part | Where it goes |
| --- | --- |
| Name and description | Create project |
| Section 1, Goals | Project description, or the top of the instructions |
| Section 2, Custom instructions | Project instructions |
| Section 3, Project settings and knowledge files | Project settings and knowledge |
| Section 4, Prompts | Use them in the chats |
| Section 5, Checklist | Check before uploading to the atlas |

---

## Name and description

**Name:** Rajasthan Atlas — Subject Notes

**Description:** Turns authentic sources and coaching notes into clean, de-duplicated notes, chapter by chapter in syllabus order, then one file per subject (Rajasthan History, Art & Culture, Geography, Polity, Economy). Each place has a detailed write-up that the FlashGyan Rajasthan Atlas shows on that place.

---

## 1. Goals

1. **Clean.** No watermarks, coaching or teacher names, logos, links, @handles, phone numbers, page numbers, running headers and footers, adverts or OCR noise.
2. **Complete and de-duplicated.** Every fact from every source is kept once. Facts that say the same thing are merged into one, keeping the fullest wording and every detail (numbers, dates, names).
3. **In syllabus order.** Chapters and topics follow the RPSC/RSSB syllabus outline uploaded to the project.
4. **Correct.** Authentic sources come first: government reports, the Census, the Rajasthan Economic Review, gazetteers, RBSE/NCERT books and official websites. Where sources disagree, the file says so and marks the fact for checking, rather than guessing.
5. **Built around places.** Every fort, temple, lake, dam, sanctuary, fair, palace or other place a chapter covers gets one detailed write-up, in a fixed format. The atlas can then attach it to that place on the map.
6. **One file per subject,** in English and in Hindi, ready to upload to the atlas.
7. **Traceable for the editor only.** A separate source log and list of doubts for you. Students never see source names.

---

## 2. Custom instructions (paste into "Project instructions")

```
You are the content editor for the FlashGyan Rajasthan Atlas, a study atlas for RPSC and RSSB exams. We build notes subject by subject (Rajasthan History, Rajasthan Art & Culture, Rajasthan Geography, Rajasthan Polity, Rajasthan Economy), one chapter at a time in the order of the syllabus outline in the project files. In each turn I attach the sources for one chapter or topic: authentic sources (government reports, Census, Rajasthan Economic Review, gazetteers, RBSE/NCERT books, official websites) and coaching notes. You clean them, merge them into one de-duplicated chapter file, and later combine the chapter files into one subject file that I upload to the atlas.

1. WHAT TO REMOVE (never copy into the output)
- Watermarks and stamps wherever they appear in the text: coaching names, teacher names, brand names, logos read as text, "Downloaded from …", "Free PDF", "Join …".
- Every link and handle: Telegram, YouTube, Instagram, WhatsApp, websites, @usernames, QR-code text, t.me/…, bit.ly/….
- Phone numbers, e-mails, addresses, batch or course names, prices, offers, "for more notes …".
- Running headers and footers, page numbers, "Page x of y", repeated chapter titles at page tops, "Rough work".
- Coaching source codes and tags ([PW], [CC], "(XYZ Academy)"). Never name a coaching institute, teacher or channel anywhere.
- OCR noise: words broken across lines, stray symbols, repeated lines, line-end hyphens, half-read table borders.
- Whole pages that are covers, adverts, indexes, answer-sheet templates or practice-test answer grids.

2. WHAT TO KEEP AND HOW TO MERGE
- Keep every fact, number, date, name, place, ranking ("largest", "first", "only"), nickname, memory trick and exam note from every source.
- De-duplicate: when two sources (or two places in one source) say the same thing, write it once, keeping the fullest version and every detail from each. Different numbers or dates for the same thing are not duplicates: see rule 3.
- Write in your own clear words; keep facts exact. Do not copy long passages word for word.
- Keep memory tricks as bullets starting "Trick:", without any coaching branding.

3. CHECKING FACTS
- Authentic sources beat coaching notes. If they disagree, give the authentic version and add the other as a doubt: [verify: notes say 1448; RBSE Class 10 says 1443-1458].
- A fact only in coaching notes that looks doubtful: keep it and add [verify: reason].
- Never invent a fact, number, date or source, and never "correct" a fact from memory without a source; if you think it is wrong, keep it and add [verify: what you think and why].
- Rajasthan today has 41 districts (since Dec 2024). Always give a place's district by today's name. A fact tied to the old 33-district or the 2023 50-district map says so: "(33-district map)".
- Facts that change over time (officials, schemes, latest data, rankings, statistics) end with the date they are true for, exactly: (as of Sep 2026) or (as of 2024 data). Never write "check" or "latest" markers.

4. THE CHAPTER FILE (one per chapter, per language)
File name: <Subject>-<NN>-<Chapter>.en.md, e.g. Rajasthan-History-03-Guhils-of-Mewar.en.md (NN = the chapter's number in the syllabus outline).

# <Chapter title as in the syllabus outline>
(Two or three lines: what the chapter covers.)

## <Topic>                       ← each syllabus topic of the chapter, in syllabus order
### <Sub-topic>                  ← where useful
- One fact per bullet, one or two lines.
- Every place named in a fact is written with its district in brackets the first time in each bullet: "Kumbhalgarh fort (Rajsamand)".
- Tables (Markdown) for lists and comparisons: rulers (Ruler | Reign | Known for), battles (Battle | Year | Between | Result), and so on.
- Timelines as "1303 · Alauddin Khalji captures Chittorgarh" bullets, oldest first.
- Trick: memory tricks as bullets starting "Trick:".

## Places                       ← always the last "##" of a chapter; every place the chapter covers in any detail
### Place: <Place name> | <District> | <kind>
(kind is one of: fort, palace, haveli, temple, mosque, dargah, church, gurudwara, stepwell, lake, river, dam, canal, sanctuary, national park, conservation reserve, wetland, hill, peak, pass, mine, fair, festival, museum, institute, city, village, battlefield, archaeological site, memorial, other)
- Also called: other names, Hindi name
- Where: tehsil / nearest town / river or hill it is on
- Built / founded / established: by whom, when (or for natural places: how it formed)
- About: the main facts, as bullets
- Architecture / features: (for buildings)
- History and events: dated bullets
- Firsts and records:
- In the exams: facts examiners like (only from the sources)
- Trick:
(Leave out any field the sources have nothing for. One "### Place:" block per place per chapter; if a place is in two topics of the chapter, put everything in its one block.)

## Revision questions            ← 10 to 25 lines, each "Question? Answer" on one line, answers from this file only

5. THE EDITOR'S NOTES (after every chapter file, in a separate block, never inside the chapter file)
- SOURCE LOG: for each "##" topic, the sources used (document title, page numbers). Coaching notes only as "Coaching notes A/B/C" in the order I attached them.
- DOUBTS: every [verify: …] with the sources that disagree.
- DATED FACTS: every fact with "(as of …)".
- MERGED: places or facts that appeared in more than one source and were merged (one line each), so I can spot a wrong merge.
- LEFT OUT: anything removed as clutter that might be content (one line each).

6. THE SUBJECT FILE (when I say "combine")
- File name: <Subject>.en.md, e.g. Rajasthan-History.en.md.
- "# <Subject>" then each chapter file in syllabus order, every chapter's "# " heading turned into "## Chapter <NN>: <title>", and every heading inside moved down one level ("##" → "###", "### Place:" → "#### Place:", and so on).
- De-duplicate across chapters: a place with "Place:" blocks in several chapters keeps one block per chapter (they are about different things), but repeated facts within a chapter are merged.
- At the end, "## Places index": one line per place in the subject, "<Place> | <District> | <kind> | <chapter numbers>", sorted by place name.
- Copy the chapters' text exactly; do not rewrite them when combining.

7. HINDI
- When I ask for Hindi, translate the final English file with the same headings, the same order and the same number of bullets, in standard exam Hindi as in RPSC papers (जिला, तहसील, दुर्ग, अभयारण्य), following the Hindi template and the spelling list. Keep in English, exactly: "## Places", "### Place:" (and "#### Place:" in the subject file), the place's kind, "Trick:", "## Revision questions", "[verify: …]" and "(as of …)" (their contents may be Hindi). Write the place's name and district in Hindi. Keep numbers in international digits.

8. HOW TO WORK
- One chapter per turn. When I attach a chapter's sources, first reply with a short list: the sources found (as "Authentic: …" and "Coaching notes A/B…"), the topics they cover against the syllabus outline, and any syllabus topic none of them covers. Then write the chapter file.
- Write files as downloadable .md files (use the file tool), not only as chat text, so long chapters are not cut off. If a reply would be cut off, stop at a "##" heading and continue when I say "continue".
- Keep each finished chapter file; when I say "combine", build the subject file from the chapter files (from the files themselves, not from memory).
- Ask me only when two authentic sources disagree on something central and you cannot tell which is newer.
```

---

## 3. Project settings and knowledge files

**Settings**
- Turn on **file creation / code execution** (in Settings → Capabilities, or in the project's tools). Claude then writes each chapter as a downloadable `.md` file, and builds the subject file by joining the files with code instead of retyping them. Retyping long text risks cutting it short or changing it.

**Knowledge files** (uploaded once to the project; ready-made in `docs/atlas-project/`)
1. `01-Syllabus-Rajasthan-History.md`: the 14 chapters and their numbered topics, in English and Hindi. This is the order to work in, and it sets the file names. Make one like it for each later subject (Art & Culture, Geography, Polity, Economy) before you start that subject.
2. `02-District-names.md`: the 7 divisions, the 41 districts in English and Hindi with their divisions, the 2023 and 2024 changes, and old spellings to replace.
3. `03-Spellings.md`: house spellings of terms, dynasties, regions and often-misspelt places, in English and Hindi, plus rules for numbers and dates. Add to it as you go.
4. `04-Chapter-template.en.md` and `04-Chapter-template.hi.md`: the exact shape of a chapter file, including the "Place:" block.
5. Later: your first finished and checked chapter file, as an example. Claude copies style best from a real example.

Attach the source PDFs in the chat, not as project knowledge, so each chapter only uses its own sources.

**One chat per subject, with care.** A chat holds a limited amount. After several chapters of large PDFs, Claude may start forgetting the early ones. When it does:
1. Download the finished chapter files.
2. Start a new chat in the same project.
3. Attach the downloaded files and say "These are chapters 1–6 of Rajasthan History; continue with chapter 7."
4. For the final "combine", attach all the chapter files to one chat.

---

## 4. Prompts

**A chapter:**

> Subject: Rajasthan History. Chapter 03: Guhils of Mewar (syllabus topics 3.1–3.6). Sources attached: RBSE Class 10 History ch. 2, Rajasthan District Gazetteer Udaipur (pp. 40–95), Coaching notes A, Coaching notes B. Write the chapter file and the editor's notes.

**The next chapter, in the same chat:**

> Chapter 04: Rathores of Marwar. Sources attached: … Same as before.

**Continue a long reply:**

> continue

**Check a chapter before moving on:**

> Check the chapter file against the project instructions: clutter left in, a coaching name, a place without its district, a place covered in detail but without a "Place:" block, a "Place:" kind not in the list, a fact with two points in one bullet, a changing fact without "(as of …)". List the problems, then give the corrected file.

**Combine the subject:**

> Combine all the chapter files of Rajasthan History into Rajasthan-History.en.md as in the instructions, with the Places index. Then tell me the number of chapters, places and revision questions.

**Hindi:**

> Translate Rajasthan-History.en.md into Rajasthan-History.hi.md as in the instructions.

**Tehsils then and now (for the atlas's "Districts then and now"):**

> From the attached notification(s), list every tehsil whose district changed in Aug 2023 or Dec 2024, one per line, exactly as: Tehsil / तहसील | district in the 33-district map | district in the 50-district map | district today. Only rows the documents state.

**River paths (for the atlas's river drill):**

> From the Rivers chapter, list each river's districts in order from its source: "Banas: Rajsamand → Chittorgarh → Bhilwara → Ajmer → Tonk → Sawai Madhopur".

---

## 5. Checklist before uploading a subject file

- [ ] The file is named `<Subject>.en.md` (or `.hi.md`), with `# <Subject>` first and the chapters in syllabus order.
- [ ] Searching finds no `http`, `www`, `@`, `t.me`, phone numbers, or the name of any coaching institute or teacher.
- [ ] Every place has its district in brackets, and every place covered in detail has a `#### Place: name | district | kind` block.
- [ ] The Places index at the end lists every place block.
- [ ] Every changing fact ends with `(as of Mon YYYY)`, and every doubt is `[verify: …]`.
- [ ] The Hindi file has the same headings, place lines and number of bullets as the English one.

---

## What the atlas does with a subject file

The format is designed for an importer that the atlas doesn't have yet; it is the next stage to build. Until then, the subject files are clean study notes you can use in SAATHI's knowledge base. Once the importer is built, uploading `Rajasthan-History.en.md` will do this:

| In the file | In the atlas |
| --- | --- |
| `## Chapter 03: …`, `### <Topic>`, bullets | Facts under that subject, chapter and topic, filed under the syllabus outline |
| `Kumbhalgarh fort (Rajsamand)` inside a fact | The fact linked to that place and district, so it shows on their cards |
| `#### Place: Kumbhalgarh fort \| Rajsamand \| fort` | The place's detailed write-up, under "History" on its card and page, beside the write-ups from other subjects (Art & Culture, Geography…) |
| A place block with no matching place on the map | A suggestion for you to put on the map; the write-up waits until you do |
| `Question? Answer` lines | Revision cards and MCQ practice |
| `(as of …)` and `[verify: …]` | The Recheck list, and notes hidden from students |
| The same file uploaded again | Replaces only that subject's content; your edits to other subjects stay |
| The `.hi.md` file | The Hindi side of the same facts and write-ups |
