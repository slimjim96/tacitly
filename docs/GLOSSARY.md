# Glossary

- **Status:** draft, second pass (3 October 2026)
- **Rule:** one word per idea, one idea per word. The word on screen, in docs and in specs is the **Word** column. The **Code** column is its one name in the database, API and source. If a word isn't here, add it before using it.

Rows marked **change** describe the target, not today's code. The [story](STORY.md) lists each change and the reasons behind the bigger ones.

## Things

| Word | Means | Code | Note |
|---|---|---|---|
| **Entry** | Anything you write down. There is one kind of entry | `entries` row | **change:** replaces the kinds note, thought, aspiration and pattern |
| **To-do** | An entry with a checkbox | `is_todo` | Any entry can be a to-do |
| **Direction** | Something you care about and want more of, held in the present. Never done, never measured against. Placed entries lean toward the direction closest in shape | **change:** `is_direction` | Replaces aspiration. See the story for why not "goal" |
| **Project** | A piece of work you come back to across sessions, with handoffs. Can be done | **change:** `is_project` | A property of any entry, not of a direction |
| **Take** | An entry written as When / I do / Because / Except, with a domain | `form = 'take'`, `domain` (spec 0003) | A form of entry, not a new kind |
| **Handoff** | Three lines, State / Next / Watch out, left at the end of a session | `handoffs` row (spec 0002) | Required of Claude under principle 4's beta rule |
| **Brief** | A one-screen summary of a project, built by script | `/api/projects/{id}/brief` (spec 0002) | Never written by a model |
| **Journal page** | One free-text page per day | `journal_days` row (spec 0001) | Entries can be pulled out of it |
| **Lens** | A set of scales you designed, for one question, like Feel or Value | `lenses` row | |
| **Scale** | One axis of a lens, with a word at each end: draining ↔ energising | `dimensions` row | Decided: "scale" on screen, `dimension` in code |
| **Weight** | How much a scale counts when comparing shapes. 0 means watched but not counted | `dimensions.weight` | |
| **Wild card** | A scale offered at random when placing, to build a sample slowly | `dimensions.wildcard` | |
| **Score** | Where you put an entry on one scale, from −5 to +5 | `scores` row, `scorer = 'me'` | Untouched means unscored, not zero |
| **Shape** | All of an entry's scores in one lens, together | the vector in `entry_vectors` | "Vector" is fine in code and in the learning project; on screen it's "shape" |
| **Pattern** | A saved shape you want to recognise, like burnout or flow | **change:** `lens_patterns` row | Belongs to its lens. Reasons in the story |
| **Perspective** | Someone else's scores on an entry, shown next to yours. Claude's is one | `scores` row, `scorer <> 'me'` | Never changes your shapes |
| **Source** | Where an entry came from: app, shortcut, claude, homelab… | `entries.source` | Shown as "via …" |

## States and properties

| Word | Means | Code | Note |
|---|---|---|---|
| **Open** | Still in play | `status = 'active'` | |
| **Done** | Finished work. Only to-dos and projects can be done | `status = 'done'` | **change:** directions can't be done |
| **Let go** | No longer relevant. Out of lists, still searchable, can be brought back | `status = 'released'` | **change:** UI word becomes "let go"; code may stay |
| **Placed** | Has at least one score from you in a lens | an `entry_vectors` row exists | Not a stored flag; it follows from scores |
| **Unplaced** | Has no scores from you yet | no `entry_vectors` row | The normal state of most entries |
| **Leans toward** | A placed entry's closest direction in a lens, if close enough | gravity in `Mind` | Replaces "orbits" and "pulled toward" |
| **Archived** | A scale taken out of the shape but keeping its scores | `dimensions.archived_at` | Scales only. Entries are let go, not archived |
| **Fading** | How long since you last touched an entry, against its quiet period | `salience`, `touched_at` | |

## Actions

| Word | Means | Code | Replaces |
|---|---|---|---|
| **Write** | Make a new entry from any door | `POST /api/entries`, `/api/ingest`, MCP `note` | "capture", "note", "add" as separate actions |
| **Tick** | Mark a to-do or project done; untick reopens it | `status` → `done` | |
| **Let go** | Move an entry out of the way, recoverably. The only way to put down a direction | `status` → `released` | "release" |
| **Bring back** | Undo a let go | `status` → `active` | |
| **Delete** | Remove for good. Always asks once | `DELETE /api/entries/{id}` | |
| **Place** | Give an entry its first score in a lens | `PUT /api/entries/{id}/scores` | "promote", "make thought", "capture with a shape", "give it a shape" |
| **Name a direction** | Set or clear the direction property on an entry | **change:** `PATCH {isDirection}` | "make aspiration", "promote" |
| **Mark as project** | Set or clear the project property | **change:** `PATCH {isProject}` | |
| **Keep** | Answer "still true?" with yes; starts a new quiet period | `POST /api/entries/{id}/affirm` | "affirm", "still true" as a button |
| **Hand off** | Leave a three-line handoff at the end of a session | **change:** MCP `handoff`, `POST /api/handoffs` | |
| **Archive** | Take a scale out of the shape, keeping scores; restore puts it back | `PATCH /api/dimensions/{id} {archived}` | |
| **Undo** | Reverse the last tick, let go, or naming, from the message that confirms it | client-side | |
| **Skip** | Pass over a guide quest | guide only | Never used for entries |

## Places

| Word | Shows | Code page | Today's label |
|---|---|---|---|
| **Inbox** | Open to-dos, then unplaced entries by day | `inbox` | Inbox |
| **Still true?** | Entries back from their quiet period | `review` | Still true? |
| **Search** | Every entry, with filters | `stream` | Everything (**change**) |
| **Directions** | Each direction and what leans toward it, described, not judged | `orbits` | Orbits (**change**) |
| **Map** | Placed entries laid out on two of your scales | `map` | Map |
| **Find by shape** | Dial in a shape, see what matches | `shape` | Shape (**change**) |
| **Loose ends** | Placed entries that lean toward no direction | `drift` | Drift (**change**) |
| **Lenses** | Your lenses, scales and patterns | `lenses` | Lenses |
| **Connect Claude** | How to let Claude in, and whether it has | `connect` | Connect Claude |
| **Guide** | Quests that teach the app | guide panel | Guide |

Directions, Map, Find by shape and Loose ends sit together under **Lenses** in the sidebar.

## Time

| Word | Means | Code |
|---|---|---|
| **Quiet period** | How long an open entry can go untouched before it comes back in Still true? | **change:** one table, below |
| **Comes back** | Shows up in Still true? once; keeping it starts a new quiet period | `ReviewAsync` |

Decided 3 October 2026:

| Entry | Quiet period |
|---|---|
| To-do | 14 days |
| Project | 14 days |
| Direction | 30 days, asked as "does this still matter to you?" |
| Placed entry | 30 days |
| Unplaced entry, not a to-do | never comes back; it just sinks |

## People

| Word | Means | Code |
|---|---|---|
| **You** | The person whose judgement it is | `scorer = 'me'` |
| **Claude** | A helper that comes in through MCP. Writes are tagged; scores are its own perspective; larger sessions end with a handoff | `source = 'claude'`, `scorer = 'claude'` |

## Retired words

Don't use these on screen or in new specs. They stay in old specs and code until those are revised.

| Retired | Use instead |
|---|---|
| note, thought (as kinds) | entry |
| goal, aspiration, target | direction |
| progress, behind, cold, neglected (about your life) | don't. Describe, don't judge |
| dimension, axis (on screen) | scale |
| vector (on screen) | shape |
| orbit, orbits, pulled toward | leans toward, Directions |
| drift, drifting | Loose ends |
| release | let go |
| promote, make thought, capture with a shape | place |
| affirm | keep |
| stream, Everything | Search |
| level, chapter, quest | fine inside the Guide only, which teaches the app, not your life |
