# Fantasia

**Self-managing workflow tool.** Paste a vague user story; Fantasia drives it to completion **without asking clarifying questions**. It fills gaps with explicit assumptions, plans, executes, verifies, reflects, and remembers.

```
$ fantasia>
```

C/UNIX aesthetic: black background, green monospace, teletype energy.

## Quick start

```bash
cd fantasia
npm install
npm start
```

Or:

```bash
make install
make run
```

No API keys required. The local heuristic executor writes real files under `./workspace/`.

### One-shot / demo

```bash
npm run demo                  # runs 3 seeded vague stories end-to-end
npm start -- --story='Need a todo list for launch week'
npm start -- demo 1           # single sample
make demo
```

### Optional web terminal

```bash
npm run start:web
# open http://127.0.0.1:3920
```

Same engine as the CLI.

## Commands (REPL)

| Command | What it does |
|--------|----------------|
| *(paste a story)* | Assumptions → plan → execute → verify → reflect → memory |
| `help` | Command help |
| `history` | Past stories / outcomes |
| `memory` | Durable memory dump (lessons, heuristics, counts) |
| `status` | Backend, checkpoints, last run |
| `retry` | Resume from last checkpoint |
| `demo` / `demo 1\|2\|3` | Seeded vague stories |
| `quit` | Exit |

## How it works

1. **Assumptions** — Ambiguity is resolved with logged defaults (never Q&A).
2. **Plan** — Numbered steps (`analyze` / `create` / `modify` / `shell` / `verify` / `reflect`).
3. **Execute** — `make`/`sh -x` style progress; checkpoints after each step; retries on failure.
4. **Verify** — Writes `VERIFICATION.md`; asserts artifacts exist.
5. **Reflect** — Writes lessons into `.fantasia/lessons/`; may add heuristics.
6. **Next run** — Planner prints **MEMORY INFLUENCE** (lesson ids + heuristic matches). Plans change observably (e.g. mid-run self-check after a failure lesson, verify-always lessons, hit counts).

### Optional Claude Code backend

If the `claude` CLI is on your `PATH`, Fantasia uses it for create/modify/shell steps. On any failure it falls back to the local executor.

```bash
npm start                 # prefer claude if available
npm start -- --local      # force local heuristic executor
```

## Memory layout

All durable state lives under **`.fantasia/`** (next to the project):

```
.fantasia/
  index.json           # catalog
  stories/             # raw + normalized stories
  plans/               # full plans + step status
  outcomes/            # success/fail summaries
  lessons/             # post-run reflections (influence next plans)
  heuristics/          # pattern → advice (seeded + learned)
  checkpoints/         # crash/resume state
```

Artifacts from runs:

```
workspace/<slug>/
  assumptions.md
  …deliverables…
  VERIFICATION.md
```

## Observe memory influence (success criterion #3)

```bash
npm start
# fantasia> demo 1          # completes; writes lessons
# fantasia> demo 2          # look for MEMORY INFLUENCE block
# fantasia> memory          # lessons + heuristic hit counts
```

In the second story’s output you should see:

- `── MEMORY INFLUENCE ──`
- `less lesson_…` lines citing lessons from the first run (e.g. “Always end with an explicit verify…”)
- `heur heur_…` lines for matched patterns (`readme|document|…`)
- `influencedBy: [heur_…, lesson_…]`

After a **failed** run, later plans may gain an extra **Mid-run self-check (lesson-driven)** step — that is intentional and observable.

## Seeded samples

| # | File | Vague story |
|---|------|-------------|
| 1 | `samples/01-todo.txt` | Launch-week todo list |
| 2 | `samples/02-readme.txt` | “Probably need a readme” |
| 3 | `samples/03-api.txt` | Tiny health API |

## Defaults we chose (no clarifying questions)

- Stack: **Node.js + TypeScript**, run via `tsx` (no build required for `npm start`)
- Theme: green-on-black teletype CLI; optional vanilla web terminal
- Offline-first local executor; Claude Code optional
- Max **2 retries** per step; continue past failures rather than stall
- Deliverables isolated under `workspace/<slug>/`
- Memory path: `.fantasia/` relative to project root

## Project layout

```
fantasia/
  package.json          # npm start → tsx src/index.ts
  Makefile              # make run | demo | web
  README.md
  samples/              # vague story seeds
  public/index.html     # web terminal
  src/
    index.ts            # CLI entry
    types/              # shared types
    memory/store.ts     # durable .fantasia/ I/O
    engine/             # assumptions, planner, runner, reflect
    executor/           # local heuristics + optional claude
    cli/                # banner, REPL, commands
    web/server.ts       # tiny HTTP terminal API
  workspace/            # generated artifacts (gitignored contents)
  .fantasia/            # durable memory
```

## License

MIT
