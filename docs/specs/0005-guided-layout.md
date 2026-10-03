# 0005: Guided layout

- **Status:** building
- **Issue:** #

## Why

Spec 0004 made capture fast, but only for someone who already knows the tricks: `[]` for a to-do, Ctrl+Enter, which tab does what. Every feature should be visible as a control, and a first-time user should be walked through the app one small step at a time, the way a game teaches its controls, without blocking someone who already knows them.

## What

- **An app shell like a desktop assistant.** A sidebar on the left with labelled, iconed sections and live counts: Inbox, Still true?, Everything, then the lens views (Orbits, Map, Shape, Drift), each with a lens picker in its header, then Lenses, Connect Claude and the Guide. On a phone the sidebar becomes a slide-out menu.
- **A composer, not a text box.** A rounded input with a visible **Note / To-do** switch, a **More** menu for a thought, aspiration or pattern with a shape, and a Save button. Typing `[]` still works: it flips the switch to To-do and removes the marker, so the shortcut teaches itself. When the Inbox is empty, the composer sits in the middle of the page with a greeting.
- **Visible actions on every row.** A checkbox on to-dos and a **⋯** menu on each note (make to-do, make thought, make aspiration, release, delete), with labels, not just symbols.
- **Undo instead of fear.** Ticking, releasing and promoting show a message at the top with **Undo**. Delete asks once, inline, not through a browser dialog.
- **The Guide.** A quest log in four chapters (Capture, Place it, Bring in Claude, Keep it true), eleven quests in all. Each quest has a one-line goal, a *Show me* button that goes to the right page and rings the control to use, and it ticks itself off when you actually do it. A tip card docked in the corner explains the current quest and announces each win; it stands aside while a dialog is open. A progress bar and level show how far along you are, and finishing a chapter gets a small celebration. Quests already done before the guide existed are credited from your data. Tips can be turned off, and the guide reopens from the sidebar.
- **Connect Claude.** A page with this server's MCP address, copy buttons for Claude Code and steps for Claude Desktop and claude.ai. It shows "Connected" once Claude has added anything.
- **Keyboard.** `/` or `n` jumps to the composer; Esc closes panels and menus.

## Done when

- [x] Every action reachable from 0004 is reachable by clicking a labelled control; no syntax needs to be known
- [x] The sidebar shows counts and works as a slide-out menu at phone width
- [x] Each quest completes from the real action, and Show me spotlights the right control
- [x] Tick, release and promote can be undone from a toast
- [x] The Connect page shows the MCP address and detects Claude's first entry
- [x] `/api/pulse` reports how many entries came from Claude; `scripts/smoke.py` checks it

## Who does what

- **Script:** quest detection, progress, counts, the spotlight
- **AI:** nothing new; Connect Claude makes the existing MCP tools easier to reach
- **You:** every word and every score, as before

## How (rough)

- UI only, apart from a `claude` count in `/api/pulse`.
- Guide progress lives in the browser (`localStorage`), so it's per device. Quests also check the data, so a new device credits what's already done.
- No schema change, no vector change.

## Open questions

- Should guide progress sync across devices (a small settings table), or is per-device fine?
- Does anyone want a command palette (Ctrl+K), or is the sidebar enough?
