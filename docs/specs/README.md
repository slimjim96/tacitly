# Specs

One file per idea, written before the code. A spec is short: it exists to pin down what the thing is for and how we'll know it works, not to design every detail.

Every spec is checked against [the principles](../PRINCIPLES.md).

## Flow

1. Copy `0000-template.md` to `NNNN-short-name.md` (next free number).
2. Fill in *Why*, *What* and *Done when*. Leave *How* rough if you don't know yet.
3. Open an issue with the **Spec** template and link the file. Discussion happens on the issue.
4. Build on a branch named `spec/NNNN-short-name`. CI must pass (it runs the full smoke test against real Postgres).
5. When merged, set the spec's status to `shipped` and add a line to `CHANGELOG.md`.

## Status values

`idea` → `ready` → `building` → `shipped` (or `dropped`, with a sentence on why)

## Index

| # | Spec | Status |
|---|---|---|
| 0001 | [Evening journal](0001-evening-journal.md) | idea |
| 0002 | [Pick-up brief](0002-pick-up-brief.md) | idea |
| 0003 | [Playbook (my take)](0003-playbook.md) | idea |
