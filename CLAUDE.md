# Working notes for Claude

A self-hosted tool for the user (Jim). It is capture-first: quick notes and to-dos land in an Inbox with no setup. Beside that, he can define lenses (vector spaces) with bipolar dimensions and score thoughts, aspirations and patterns from -5 to +5, and Postgres/pgvector keeps the vectors and does the searching. Read `README.md` for the model and `docs/PRINCIPLES.md` before proposing features.

## Handoff (3 October 2026)

- **State:** Two spec branches are pushed and unmerged. `spec/0004-quick-capture` adds notes, to-dos and the Inbox. `spec/0005-guided-layout` is built on top of it: the sidebar shell, the composer, row menus, undo toasts, Connect Claude, and the Guide (11 quests). Both pass the smoke test against Docker. The whole guide was played through in headless Chrome on a fresh install, at desktop and phone width, in light and dark mode.
- **Direction:** Capture-first (decided 3 October 2026). Scoring is optional, later, and only for what earns it. The principles stay as written. The original vector concept may become a separate game or learning project later; keep it out of this repo.
- **Next:**
  1. Open PRs for 0004, then 0005 (CI runs on PRs only; `gh` isn't installed here). Merge in that order, set both specs to `shipped`, then deploy to the homelab and run the smoke test there.
  2. Build specs 0001 evening journal, 0003 playbook, 0002 pick-up brief, in that order. Each new feature should add a quest to `QUESTS` in `web/src/guide.tsx` if it has a control worth teaching. 0003 adds `take`, which should also be a promotion target for notes.
- **Watch out:**
  - Guide quests complete through `emit(event)` from the component that does the action, plus an optional `check(pulse)` for credit from data. A quest's `target` is a `data-guide` attribute; keep those attributes when restyling.
  - Notes are unscored by rule, enforced in `Mind` (`Refused` becomes a 400, or a tool error over MCP). A note never has a vector.
  - `db/schema.sql` runs on every start and must stay idempotent. It carries the v1 and v2 upgrade paths.
  - Vectors are built only by the triggers in `schema.sql`. Application code never writes a vector. The rule (`score_or_0 * sqrt(weight)`, active dimensions by position, `scorer = 'me'` only) is mirrored in `VectorSpace` in `Engine/Algorithms.cs`; change both together.
  - `EntryCols` in `Db.cs` is read by position; `NearestAsync` reads the distance from the column after it. Adding an entry column shifts both.
  - `src/Tacitly.Api/wwwroot/` is build output and is not committed. Run `npm run build` in `web/` to produce it.
  - On Jim's Windows machine `python3` hits the Store stub; use `python` (3.11). The clone has `core.filemode false`. Long heredocs in the Bash tool can fail to parse here; write files with the editor instead.

## Name

The project is **Tacitly**, renamed from "InsideOut" (a Disney film title) on 2 October 2026. Namespace and project `Tacitly.Api`, config keys `Tacitly__*`, env vars `TACITLY_*`, header `X-Tacitly-Token`, database/user/image/compose name `tacitly`, localStorage keys `tacitly.*`, MCP `serverInfo.name` `tacitly`.

## Open questions from the specs

- Store Claude's suggested scores as a `claude` perspective (proposed) or not at all?
- Is a project a flagged aspiration (proposed) or its own kind of entry?
- Should a project with no handoff for 14 days appear in "Still true?" (proposed: yes)

## Commands

```bash
docker compose up -d db                                   # Postgres + pgvector only
cd web && npm ci && npm run build                         # UI into wwwroot (or `npm run dev` for hot reload)
Tacitly__ConnectionString="Host=localhost;Database=tacitly;Username=tacitly;Password=<pw>" \
  dotnet run --project src/Tacitly.Api --urls http://localhost:5080
python3 scripts/smoke.py http://localhost:5080 [token]    # end-to-end; add --keep to leave sample data
```

## Conventions

- New work starts as a spec in `docs/specs/` (template there). Branch `spec/NNNN-short-name`.
- Every endpoint and trigger change gets a check in `scripts/smoke.py`.
- All SQL lives in `Store/Db.cs` and `db/schema.sql`.
- When you stop, replace the Handoff section above with a new three-line one: state, next, watch out.
