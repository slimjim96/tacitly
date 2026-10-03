# 0002: Pick-up brief

- **Status:** idea
- **Issue:** #

## Why

AI writes a lot of documentation, and it is detailed but narrow. Coming back to a personal project after two weeks, the need is the opposite: one wide, short page that says what this is, where it was left and what to do next.

## What

- **Handoff note:** when you stop working on something, three lines: **State**, **Next**, **Watch out**. Written by you in the journal, or by an AI at the end of its session through MCP. Three lines is the limit, which is the point: it forces the compression AI doesn't do by default.
- **Pick up:** a button on any aspiration marked as a project. One screen, capped at about 200 words:
  - the goal and its shape
  - the latest handoff note, and how long ago it was written
  - what has happened since (new thoughts in its orbit, scores that moved)
  - open decisions
  - links to the repo and the detailed docs
- The same brief as plain markdown (`/api/projects/{id}/brief.md`) and as an MCP tool, so a new AI session can start from it.

## Done when

- [ ] A handoff note can be added to a project from the UI, the API and MCP
- [ ] The brief fits one screen and shows the age of the last handoff
- [ ] The brief is built with no AI call
- [ ] A new Claude session can fetch it with one tool call
- [ ] `scripts/smoke.py` covers handoff and brief

## Who does what

- **Script:** assembling the brief from the data
- **AI:** writing the three-line handoff at the end of its own session (`handoff`), reading the brief at the start (`pick_up`)
- **You:** deciding what "next" is

## How (rough)

- `entries.is_project boolean`, `entries.links jsonb` (repo, docs)
- New table `handoffs(id, entry_id, state, next, watch_out, source, at)`
- `POST /api/projects/{id}/handoff`, `GET /api/projects/{id}/brief(.md)`
- MCP tools `handoff(project, state, next, watch_out)`, `pick_up(project)`
- No change to vectors

## Open questions

- Is a project just a flagged aspiration (proposed), or its own kind of entry?
- Should a project with no handoff for 14 days appear in the "still true?" queue?
