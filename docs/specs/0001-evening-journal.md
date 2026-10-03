# 0001: Evening journal

- **Status:** idea
- **Issue:** #

## Why

The end of the day is when the unwritten things surface: what moved, what's stuck, what was decided and why. Today Tacitly only takes one thought at a time, so there's nowhere for a day to land, and nothing that makes talking it through with an AI leave a trace.

## What

- A **Journal** tab with one page per day. Free text, no required structure. Three optional prompts sit above the box: *what moved, what's stuck, what did I decide*.
- **Pull out:** select a sentence and turn it into a thought, an aspiration or a take (spec 0003). It keeps a link back to the day. Score it then, or leave it for the Unscored list.
- **Day footer**, assembled automatically: what was captured today, how many entries are due a "still true?", and one wild-card dimension.
- **Talk mode:** from Claude (via `/mcp`), an evening interview. Claude asks, you answer, and your words go into the day's page. It can propose pull-outs; you accept or skip each one.
- A plain calendar strip showing which days have a page. No streaks, no scoring of the habit.

## Done when

- [ ] A day's page can be written, edited and reopened; text search finds it
- [ ] A selected sentence becomes an entry linked to that date
- [ ] The footer shows today's captures, the review count and a wild card
- [ ] Claude can read and append to a day and capture from it through MCP
- [ ] `scripts/smoke.py` covers the journal endpoints and MCP tools

## Who does what

- **Script:** the day footer, the calendar strip, linking pull-outs to the date
- **AI:** the interview and proposed pull-outs (`journal_get`, `journal_append`, existing `capture`)
- **You:** the words, and every score

## How (rough)

- New table `journal_days(day date primary key, body text, updated_at)`; `entries.journal_day date null`
- `GET/PUT /api/journal/{day}`, `GET /api/journal?from=&to=`; extend `/api/entries?q=` to search journal text
- MCP tools `journal_get(day)`, `journal_append(day, text)`
- No change to vectors or triggers

## Open questions

- Should Claude's suggested scores be stored at all? Proposal: yes, as the `claude` perspective, so they show as an overlay and never count (principle 3).
- Is phone dictation enough for voice, or does talk mode need its own page?
