# Working notes for Claude

A self-hosted tool for the user (Jim). It is capture-first: quick notes and to-dos land in an Inbox with no setup. Beside that, he can define lenses (vector spaces) with bipolar dimensions and score thoughts, aspirations and patterns from -5 to +5, and Postgres/pgvector keeps the vectors and does the searching. Read `README.md` for the model and `docs/PRINCIPLES.md` before proposing features.

## Handoff (3 October 2026)

- **State:** Spec 0004 (quick capture) is built on branch `spec/0004-quick-capture`: notes, to-dos, Inbox, promotion, the stale to-do rule, MCP `note`/`todos`/`done`, and the app opens with no lenses. The smoke test passes locally against Docker, and the UI was driven in headless Chrome. No GitHub issue exists for 0004 yet (`gh` isn't installed here).
- **Direction:** Capture-first (decided 3 October 2026). Scoring is optional, later, and only for what earns it. The principles stay as written. The original vector concept may become a separate game or learning project later; keep it out of this repo.
- **Next:**
  1. Merge 0004 once CI passes on the PR, set its status to `shipped`, then deploy to the homelab and run the smoke test there.
  2. Build specs 0001 evening journal, 0003 playbook, 0002 pick-up brief, in that order. 0003 adds `take`, which should also be a promotion target for notes.
- **Watch out:**
  - Notes are unscored by rule, enforced in `Mind` (`Refused` becomes a 400, or a tool error over MCP). A note never has a vector, so lens views need no filter beyond `unscoredIn`, which already skips notes.
  - `db/schema.sql` runs on every start and must stay idempotent. It carries the v1 and v2 upgrade paths.
  - Vectors are built only by the triggers in `schema.sql`. Application code never writes a vector. The rule (`score_or_0 * sqrt(weight)`, active dimensions by position, `scorer = 'me'` only) is mirrored in `VectorSpace` in `Engine/Algorithms.cs`; change both together.
  - `EntryCols` in `Db.cs` is read by position; `NearestAsync` reads the distance from the column after it. Adding an entry column shifts both.
  - `src/Tacitly.Api/wwwroot/` is build output and is not committed. Run `npm run build` in `web/` to produce it.
  - On Jim's Windows machine `python3` hits the Store stub; use `python` (3.11). The clone has `core.filemode false`.

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
