# 0004: Quick capture

- **Status:** building
- **Issue:** #

## Why

Most of what comes to mind during a day is small: a note, a reminder, something to do. Today every capture asks for a kind and offers sliders, and the app won't open at all until a lens exists. That is the right ritual for a thought worth placing, and the wrong one for "call the plumber". If writing something down costs a judgement, it doesn't get written down. Tacitly should take a line in two seconds and let the scoring happen later, on the few things that earn it, or never.

## What

- **Note**, a new kind of entry, and the default in the capture box. Type a line, press Enter, it's saved. No kind picker, no sliders, no landing panel. Shift+Enter for a second line.
- **To-do:** any note can be a to-do. Start the line with `[]` or tick the box next to the input. It gets a checkbox; ticking it marks it done. That is the whole to-do model: no dates, priorities or projects.
- **Inbox** becomes the first tab: open to-dos at the top, then today's notes, then earlier ones, newest first. Done to-dos collapse into a "done in the last day" line. Text search covers notes like everything else.
- **Make it more:** from the Inbox or the entry drawer, a note can become a thought, an aspiration, a pattern, or a take once spec 0003 adds takes. It keeps its text, date and history, and then appears in the lens views as unscored, ready to place. This is the only path from capture into the vectors.
- **Nothing scored, nothing counted.** Notes have no vector, don't count in the "unscored" badge, and stay out of drift, themes, orbits and the map. The lens views look exactly as they do today.
- **Stale to-dos:** an open to-do older than 14 days appears in "Still true?", where *still true* keeps it, *done* ticks it and *release* drops it. Plain notes fade quietly and never come back on their own.
- **No lens needed:** with zero lenses the app opens on the Inbox. The starter-lens offer moves into the Lenses tab.
- **From anywhere:** `/api/ingest` and MCP accept notes and to-dos, so a phone shortcut or a Claude session can drop a line in.

## Done when

- [x] A note is saved with one line and Enter, with no other input
- [x] `[]` or the checkbox makes it a to-do; ticking it marks it done, unticking reopens it
- [x] The Inbox lists open to-dos first, then notes, newest first, and search finds them
- [x] A note can become a thought or aspiration (a take after spec 0003), keeping its text and date
- [x] Notes don't appear in the unscored count, drift, themes, orbits or the map
- [x] An open to-do older than 14 days shows in "Still true?"
- [x] A fresh install with no lenses opens on a working Inbox
- [x] Claude can add a note or to-do, list open to-dos and tick one done through MCP
- [x] `scripts/smoke.py` covers notes, to-dos, promotion, the review rule and the MCP tools

## Who does what

- **Script:** saving, the `[]` shortcut, the Inbox order, the 14-day rule, promotion
- **AI:** dropping in notes and to-dos from a session, and listing or ticking them (`note`, `todos`, `done`). It never promotes a note or scores it.
- **You:** the words, which notes become more, and every score

## How (rough)

- Add `note` to the `entries.kind` check; add `entries.is_todo boolean NOT NULL DEFAULT false`. "Done" reuses the existing `status = 'done'`.
- Capture: `CaptureRequest.Kind` becomes optional and defaults to `note`; a body starting with `[]` sets `is_todo` and the marker is stripped. `/api/ingest` takes the same rule and `todo: true`. Its default kind stays `thought` so existing shortcuts keep working.
- `GET /api/inbox` returns open to-dos, then notes, newest first. `PATCH /api/entries/{id}` already takes `status` and `kind`; add `isTodo`. Changing kind from `note` is the promotion.
- Exclude `kind = 'note'` from the unscored count (`Db.cs`), drift and the lens list views. Review queue: active notes are skipped, except open to-dos older than 14 days.
- UI: the Inbox tab first, the plain capture box above it, and the current kind picker and sliders move behind a "place it" link on the saved entry. `App.tsx` no longer gates everything on `lenses.length`.
- MCP tools `note(text, todo?)`, `todos()`, `done(id)`; the existing `capture` tool accepts `kind: note`.
- **Vectors and triggers are unchanged.** A vector only exists for an entry with at least one score from `me`, so unscored notes never get one. Scoring a note directly isn't offered; promote it first.

## Open questions

- Does a take (spec 0003) also start life as a note, or only through the journal?
- Should the Inbox show notes from Claude or `/api/ingest` separately from your own, or mixed with a source tag as today?
- Tags in the text (`#home`), or leave grouping to search until it hurts?
