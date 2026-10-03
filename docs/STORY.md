# The story

- **Status:** draft, second pass (3 October 2026). Decisions so far are logged at the end.
- **Rank:** this is the top document. The [glossary](GLOSSARY.md) names what the story describes. The [principles](PRINCIPLES.md) are the rules it must keep. Every spec must agree with all three. When something disagrees, fix it here first, then change the spec, then the code.

## What Tacitly is

Tacitly is where things go when they come out of your head. You write a line and it's kept. Most lines stay just that: an entry you might search for one day, or a to-do you tick off. A few matter more. For those you can name the **directions** you care about, and place entries on **scales** you designed yourself, to see which way they lean. Over time Tacitly also holds your own way of doing things, written in your words, so an AI can work the way you would.

It is for one person, self-hosted. Claude is a helper that comes in through a door you open, and everything it does is labelled as its own.

## The promise

1. **Writing something down costs nothing.** No setup, no choices, no scoring.
2. **Nothing gets lost quietly, and nothing nags.** Things you left open come back once and ask whether they're still true. There are no streaks and no red badges for missed days.
3. **Every judgement is yours.** Scores, directions and decisions come from you. Claude can suggest, and its suggestions always show as Claude's.
4. **It lives in the present.** Tacitly shows where things are and which way they lean today. It never sets targets for your life, measures progress toward them, or compares you with anyone.

## Day one: the front door

You open Tacitly and see one box and a greeting. You type a line and press Enter. It's saved as an **entry** in your **Inbox**. If it's something to do, you flip the switch to **To-do** first, and it gets a checkbox.

That's the whole app on day one. The sidebar shows Inbox, Still true? and Search. Everything else is either empty or tucked under **Lenses**, which the app doesn't push.

The guide offers one short chapter: write an entry, add a to-do, tick it, let one go. Then it stops asking.

## Week one: the rhythm

During the day you write things down without thinking. A phone shortcut or Claude can drop lines in too, each tagged with where it came from.

In the evening, or whenever you like, you look at the Inbox. You tick what's finished. You **let go** of what no longer matters; it leaves the Inbox but stays searchable. Nothing else is asked of you.

Later, when spec 0001 lands, the evening has a home: a **journal** page for the day. You can pull a sentence out of it into an entry.

## Month one: the few things that matter

Some entries keep coming up. You can do two things with them, both optional and both reversible:

- **Name a direction.** A direction is something you care about and want more of in your days, like *rest properly* or *make things with my hands*. It is a heading, not a destination. It is never done, never scored as a success or failure, and never compared. You can let it go when it stops mattering.
- **Place it.** You give an entry scores on a **lens**, a set of scales you designed, like draining ↔ energising. The scores are its **shape**.

Placing is where the original idea lives. Once a few entries are placed, the lens pages come alive. A placed entry **leans toward** the direction closest to it in shape. A map lays everything out on your own scales. You can dial in a shape and find what matches it.

The Directions page shows each direction and what currently leans toward it. It describes; it doesn't judge. A direction with nothing leaning toward it is just quiet, not neglected.

The guide opens this as a side quest when you place your first entry, not before.

Tacitly doesn't sort your life into long-term and short-term. There is no line between a "big" entry and a small one, and the app never asks you to draw one. A to-do is just an entry with a checkbox. A direction is just an entry you've said you care about. Something can be both, or neither, and most entries are neither. Directions live on the lens side, for the moments that want them; the Inbox never asks about them.

## Month three: what comes back

Entries you left open come back in **Still true?** once, after a quiet period that depends on what they are. You **keep** them, finish them, or let them go. For a direction the question is simply: does this still matter to you?

Your way of doing things builds up as **takes**: when this happens, I do that, because, except. Claude reads them at the start of a session. A piece of work you keep coming back to can be marked as a **project**. Each work session on it ends with a three-line **handoff**: state, next, watch out. Coming back after two weeks, a one-screen **brief** tells you where you were. A project, unlike a direction, can be finished.

## What Claude does and doesn't do

- **Does:** write entries and to-dos when you ask, tick a to-do you name, search, read your lenses and takes, and write handoffs and briefs.
- **Scores only as Claude.** Its scores show as a second shape next to yours. They never change your shapes, your directions, or what leans toward them.
- **Doesn't:** name directions, place entries, let things go, or delete. Those are your judgement.
- **Leaves a trail.** Everything it writes is tagged "via claude", and larger pieces of work end with a handoff (see principle 4, below).

## What Tacitly never does

- Score, rank or summarise your entries with a model and store the result as yours.
- Ask you to score something in order to save it.
- Set targets, show progress toward them, or call anything behind, cold or neglected.
- Count streaks, or show anything as overdue.
- Delete without asking, or hide something without a way back.

## Why directions, not goals

Strict goal-setting is widely criticised for causing burnout, encouraging unhealthy comparison, and pulling attention into the future at the expense of the present. The original *aspiration* carried some of that: a finish line, a pull, a "stated vs revealed" gap. A direction keeps what was useful and drops the rest:

- **It keeps the mechanism.** Entries still lean toward the direction closest in shape, so the lens views keep working unchanged underneath.
- **It drops the finish line.** A direction is never done, so there is nothing to fall short of. "Done" now means one thing: finished work.
- **It drops the scoreboard.** No trends toward a target, no "cold" cards, no "neglected". The gap between how you described a direction and what actually leans toward it is still shown, worded as an observation, never as a verdict.
- **It frees projects.** A project used to be "a flagged aspiration", which mixed caring about something with getting it done. Now a project is any entry you work on in sessions, and it may lean toward a direction like anything else.

## Principle 4, beta

Principle 4 says anything AI writes must come with a three-line handoff. Taken literally, a single to-do Claude adds would need three more lines, which is noise. Taken loosely, nothing ever gets one, which is today. The beta rule:

1. **One small thing needs no handoff.** A single entry, under a paragraph, written because you asked. The entry is its own summary.
2. **More than one thing does.** If Claude writes two or more entries, any entry longer than a paragraph, or any summary, brief or journal text in one session, it ends that session with one handoff: state, next, watch out.
3. **The handoff lands where you'll see it.** With a project, it attaches to the project. Without one, it goes to the Inbox as a single entry tagged via claude, so the session's work arrives with its own wide view on top.
4. **Visible before enforced.** The server can't see a session end, so in the beta it doesn't block anything. Instead, when Claude has written two or more entries since its last handoff, the Inbox says so in one quiet line. If that line shows up often, phase two makes the MCP tools refuse a second write until a handoff is given.

The same rule already applies to Claude working on this repo: `CLAUDE.md` ends every session with a three-line handoff.

## Why patterns belong to lenses

A pattern is a named shape you want to recognise, like *burnout*. Today it's an entry. The draft moves it under its lens. The reasons:

- **Its meaning is the lens.** "Burnout" is Energy −4, Fear +3 on Feel. Without that lens it's just a word, and if you archive a scale, its meaning changes. Something that can't exist without its lens belongs to that lens.
- **It isn't something you wrote down.** It's a search you saved: you dial in a shape and keep it. It never needs a checkbox, never comes back as still true, and never leans toward a direction. As an entry it gets all of those by default and has to opt out of each one.
- **It keeps the Inbox honest.** Under the one-kind-of-entry model, every entry is unplaced until you place it. A pattern is placed by definition. Keeping it out of entries removes the only exception to that rule.

What we give up, and how it's handled:

- **Patterns show on the map and in shape search today because they're entries.** They'll still be drawn on the map as reference marks, and shape search will match against them, read from the lens instead.
- **Migration.** Existing patterns move from `entries` into a `lens_patterns` table in the idempotent schema script, one row per pattern per lens it was scored in. Nothing is lost.
- **A pattern that spans lenses.** None does today. If one ever should, it becomes one pattern per lens with the same name, which keeps the rule simple.

## Where today's app disagrees with this story

These are the seams found by walking the app from the outside in. The change column is what follows from the story and glossary.

| # | Today | The story says | Change |
|---|---|---|---|
| 1 | An entry's kind says both what it is and whether it's been placed | One kind of thing, the entry. To-do, direction and project are properties; placed follows from scores | Replace `kind` with properties |
| 2 | A note can't be scored, but an unscored thought can | Any entry can be placed; unplaced entries all live in the Inbox | Merge notes and unscored thoughts |
| 3 | Capture defaults differ: app gives a note, ingest and MCP `capture` give a thought | Every door makes a plain entry; scores, if sent, place it | Same defaults in every door |
| 4 | "Done" means a ticked to-do, and also an aspiration that stops pulling | Done means finished work: to-dos and projects. Directions are never done | Remove done from directions |
| 5 | Release, archive, delete and skip all mean going away | Let go (entries), archive (scales only), delete (gone for good), skip (guide only) | Rename in the UI and the API docs |
| 6 | Three fading rules: half-life, 14-day to-dos, notes never | One table of quiet periods | One rule, one place in code |
| 7 | MCP `score` and `capture` write scores as you | Claude scores only as `claude` (principle 3) | Fix the MCP tools; fix the Connect page copy |
| 8 | Nothing Claude writes carries a handoff (principle 4) | The beta rule above | MCP `handoff` tool, Inbox line, server instructions |
| 9 | The guide makes lenses level 2 of the main path | Capture is the main line; lenses are a side quest | Re-sequence `QUESTS` |
| 10 | Patterns are entries | A pattern is a saved shape that belongs to a lens | Move patterns under lenses |
| 11 | Specs add new kinds: take (0003), project as a flagged aspiration (0002) | A take is a form of entry; a project is a property of any entry | Revise 0002 and 0003 |
| 12 | Specs 0001 to 0003 were written before capture-first | Specs follow the story | Re-check 0001 to 0003; 0001's wild-card footer goes |
| 13 | The lens pages sit in the main nav with jargon names | Grouped under Lenses, named by what they show | Rename per the glossary |
| 14 | Specs were edited after the build to match it, and ticked by the builder | Story, then glossary, then spec, then code; "done when" is ticked by checks | Change the spec workflow |
| 15 | Aspirations are goals: a pull, a finish line, "cold" cards, "Neglected, or not really this shape?" | Directions: present, never done, described not judged | Rename to direction; remove done; rewrite the Orbits copy as neutral observation |

## How this governs the work

1. A change to how Tacitly feels or behaves starts here, as a sentence in the story.
2. Any new word goes into the glossary, with its one meaning and its one name in code.
3. A spec cites the part of the story it serves and uses only glossary words.
4. Code follows a merged spec. If building shows the spec is wrong, the spec changes first, in its own commit, before the code that depends on it.
5. "Done when" items are ticked by a smoke check or a recorded walk-through, not by whoever built it.

## Decisions

| Date | Question | Decision |
|---|---|---|
| 3 Oct 2026 | Goal or aspiration? | Neither. Goal-setting causes burnout, comparison and future-living. Use **direction**: present, never done, never measured |
| 3 Oct 2026 | Scale or dimension on screen? | **Scale** on screen; `dimension` stays in code |
| 3 Oct 2026 | Quiet periods | Accepted as in the glossary |
| 3 Oct 2026 | Principle 4's scope | **Beta rule** above; review after a few weeks of use |
| 3 Oct 2026 | Patterns: entries or lenses? | **Lenses**, for the reasons above |
| 3 Oct 2026 | Is "direction" the right word? | **Yes, for now.** Long-term versus short-term is a grey area the app deliberately stays out of; directions stay optional and on the lens side |

## Open questions for Jim

- **Principle 4 beta.** Is "two or more entries, or anything over a paragraph" the right line?
