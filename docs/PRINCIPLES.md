# Principles

Every spec is checked against these. They came out of building v1 to v3 and out of how the tool is meant to be used alongside AI.

1. **You write the vectors.** Scores are your judgement. Nothing is inferred and stored as if it were yours.
2. **Scripts do the clicks.** Anything you could write steps for is code, SQL or a trigger, covered by `scripts/smoke.py`. It runs the same way every time and costs nothing to run.
3. **AI sits at the judgement points.** It comes in through the MCP endpoint to interview, compress or propose. It never decides. When it scores, it scores as its own perspective (`scorer = claude`), which is compared with yours and never changes your vectors.
4. **Wide before deep.** AI produces detail easily and breadth badly. Anything AI writes into this system must come with a three-line handoff: state, next, watch out.
5. **Your take is a file you own.** Defaults, what you check first and the weird cases live in plain text you can read, edit and hand to any AI.
