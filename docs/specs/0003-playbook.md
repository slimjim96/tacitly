# 0003: Playbook (my take)

- **Status:** idea
- **Issue:** #

## Why

Work splits into clicks (anything you could write steps for) and decisions (anything where the answer starts with "it depends"). AI handles the clicks. For decisions, an AI asked cold can't tell which of ten valid answers is yours, so it sounds like nobody. The fix is to write your take down somewhere the AI reads every time, and to keep that file yours.

## What

- A new kind of entry, a **take**, with four short parts: **When** (the situation), **I do** (your default), **Because**, **Except** (the weird cases). Each has a free-text **domain** such as "client email", "code review" or "trading risk".
- A **Playbook** tab: takes grouped by domain, edited in place.
- **One file out:** the whole playbook, or one domain, as markdown (`/api/playbook.md`). Drop it into a project's instructions or a `CLAUDE.md`. Over MCP, Claude can fetch it with `get_playbook`, and the server's opening instructions tell it to do so first.
- **Feeding it:** "pull out as take" from the journal (spec 0001). Takes fade and come back in "still true?" like everything else, so stale defaults get challenged.
- **Sort my week:** a starter lens, *Work*, with two dimensions: Judgement (steps ↔ it depends) and Repeats (one-off ↔ weekly). Score a week's tasks and the map shows two corners: steps + weekly is a script to write; it depends + weekly is a take to write.

## Done when

- [ ] A take can be created, edited and grouped by domain
- [ ] `/api/playbook.md` returns the playbook as one readable file
- [ ] Claude reads the playbook at the start of a session through MCP
- [ ] Takes appear in the review queue when they fade
- [ ] The Work lens can be added in one click
- [ ] `scripts/smoke.py` covers takes and the export

## Who does what

- **Script:** grouping, export, resurfacing
- **AI:** reads the playbook; may propose a take from a journal answer, which you accept or rewrite
- **You:** every take is in your words

## How (rough)

- Add `take` to the `entries.kind` check; `entries.domain text null`; the four parts as columns or as headed sections in `body`
- `GET /api/playbook.md?domain=`; MCP tool `get_playbook(domain?)` and a line in `initialize.instructions`
- `POST /api/lenses/starter/work`
- Takes can be scored but don't have to be; vectors and triggers are unchanged

## Open questions

- One playbook, or separate files per domain when it grows?
- Should the script candidates from "Sort my week" become their own list (a registry of clicks handed to scripts), or is the map view enough?
