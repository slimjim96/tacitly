# Working notes for Claude

A self-hosted tool for the user (Jim). Things come out of his head as entries in an Inbox, with no setup; a to-do is an entry with a checkbox. For the few that matter he can place entries on lenses (sets of scales he designed, each scored -5 to +5), and Postgres/pgvector keeps the shapes and does the searching.

**Read first, in this order:** `docs/STORY.md` (what Tacitly is; it outranks everything else), `docs/GLOSSARY.md` (one word per idea, and its one name in code), `docs/PRINCIPLES.md`. The code and specs 0001 to 0005 still use older words (note, thought, aspiration, orbits, drift); the glossary maps them.

## Handoff (3 October 2026)

- **State:** Three branches are pushed and unmerged, each stacked on the one before: `spec/0004-quick-capture` (entries, to-dos, Inbox), `spec/0005-guided-layout` (sidebar shell, composer, Guide), and `docs/story-and-glossary` (the story and glossary). The code works and passes the smoke test, but it doesn't match the story yet: the story's table "Where today's app disagrees with this story" lists 15 seams.
- **Next:**
  1. Open PRs and merge in order: 0004, 0005, then story-and-glossary (`gh` isn't installed here; CI runs on PRs only). Deploy to the homelab and run the smoke test there.
  2. Work the 15 seams through the story's workflow: story, then glossary, then a spec, then code. Start with seam 7 (Claude's MCP tools score as `me`, against principle 3), then seams 1 to 3 (one kind of entry). Re-check specs 0001 to 0003 against the story before building any of them.
- **Watch out:**
  - Use only glossary words in new specs, UI text and docs. A new word goes into the glossary first. Specs change before the code that depends on them, in their own commit, and "done when" is ticked by checks, not by the builder.
  - Guide quests complete through `emit(event)` from the component that does the action, plus an optional `check(pulse)`. A quest's `target` is a `data-guide` attribute; keep those when restyling. Seam 9 re-sequences the quests.
  - `db/schema.sql` runs on every start and must stay idempotent. Vectors are built only by its triggers; the rule is mirrored in `VectorSpace` in `Engine/Algorithms.cs`, so change both together. `EntryCols` in `Db.cs` is read by position.
  - `src/Tacitly.Api/wwwroot/` is build output, not committed. On Jim's Windows machine use `python`, not `python3`; long heredocs in the Bash tool can fail to parse, so write files with the editor.

## Name

The project is **Tacitly**, renamed from "InsideOut" (a Disney film title) on 2 October 2026. Namespace and project `Tacitly.Api`, config keys `Tacitly__*`, env vars `TACITLY_*`, header `X-Tacitly-Token`, database/user/image/compose name `tacitly`, localStorage keys `tacitly.*`, MCP `serverInfo.name` `tacitly`.

## Open questions

Answered questions are logged in the story's Decisions table; open ones are listed at the end of the story. The three that used to sit here are settled there: Claude scores only as `claude`, a project is a property of any entry, and projects come back after 14 days.

## Commands

```bash
docker compose up -d db                                   # Postgres + pgvector only
cd web && npm ci && npm run build                         # UI into wwwroot (or `npm run dev` for hot reload)
Tacitly__ConnectionString="Host=localhost;Database=tacitly;Username=tacitly;Password=<pw>" \
  dotnet run --project src/Tacitly.Api --urls http://localhost:5080
python3 scripts/smoke.py http://localhost:5080 [token]    # end-to-end; add --keep to leave sample data
```

## Conventions

- New work starts as a sentence in `docs/STORY.md`, then a spec in `docs/specs/` (template there) that cites it and uses glossary words. Branch `spec/NNNN-short-name`.
- Every endpoint and trigger change gets a check in `scripts/smoke.py`.
- All SQL lives in `Store/Db.cs` and `db/schema.sql`.
- When you stop, replace the Handoff section above with a new three-line one: state, next, watch out.
