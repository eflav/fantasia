# Fantasia

**Self-managing workflow tool.** Paste a vague user story; Fantasia drives it to completion **without asking clarifying questions**. It fills gaps with explicit assumptions, plans, executes, verifies, reflects, and remembers.

```
$ fantasia>
```

C/UNIX aesthetic: black background, green monospace, teletype energy — CLI and a mobile-friendly web terminal.

## Quick start

```bash
cd fantasia
npm install
npm start
```

Or: `make install && make run`

**No API keys required.** The local heuristic executor writes real files under `./workspace/`. Demos stay fully keyless.

### One-shot / demo

```bash
npm run demo                  # 3 seeded vague stories end-to-end
npm start -- --story='Need a todo list for launch week'
npm start -- --local demo 1   # force local backend
make demo
```

## Web terminal (iPhone / phone)

Fantasia’s web UI is a minimal green-on-black terminal that hits the same engine. **A real public URL is required for iPhone access** (Safari cannot reach your laptop’s `localhost`). Use a host (Render, Fly, Railway, …), a tunnel (`ngrok`, `cloudflared`), or LAN with your machine’s IP.

```bash
npm run start:web
# listens on 0.0.0.0:$PORT (default 3920)
# open http://127.0.0.1:3920 locally
```

Optional shared secret:

```bash
export FANTASIA_TOKEN='your-secret'
npm run start:web
# phone: https://your-host/?token=your-secret
```

### Deploy (Docker / Render)

```bash
docker build -t fantasia .
docker run -p 3920:3920 -e ANTHROPIC_API_KEY -e FANTASIA_TOKEN fantasia
```

Or use `render.yaml` / `Procfile` (`web: npm run start:web`). Set `ANTHROPIC_API_KEY` (and optionally `FANTASIA_TOKEN`) in the host’s env — never commit secrets.

## Backends

| Priority | When | Notes |
|----------|------|--------|
| **anthropic** | `ANTHROPIC_API_KEY` is set | Messages API (`claude-sonnet-4-20250514` by default). Best for **phone/web** hosts. |
| **claude** | `claude` CLI on `PATH`, no API key, not `--local` | Optional **desktop** Claude Code path. |
| **local** | always available | Heuristic executor; no keys; demos use this. |

On Anthropic/Claude failure, Fantasia **falls back to local** for that step.

```bash
export ANTHROPIC_API_KEY='sk-ant-…'   # https://console.anthropic.com/
# optional: export ANTHROPIC_MODEL='claude-3-5-sonnet-latest'
npm start                 # picks anthropic
npm start -- --local      # force local
```

See `.env.example`. Do not commit `.env`.

**Claude Code CLI** is optional and desktop-oriented. For iPhone/web, prefer `ANTHROPIC_API_KEY` on the server — you do not need the `claude` binary on the host.

## Commands (REPL / web)

| Command | What it does |
|--------|----------------|
| *(paste a story)* | Assumptions → plan → execute → verify → reflect → memory |
| `help` | Command help |
| `results` | List recent `workspace/<slug>/` deliverables |
| `results <slug>` | Print key files (README, TODO, VERIFICATION, …) |
| `lessons` | Recent lessons + top heuristics (self-improve) |
| `history` | Past stories / outcomes |
| `memory` | Durable memory dump |
| `status` | Backend, checkpoints, last run |
| `retry` | Resume from last checkpoint |
| `demo` / `demo 1\|2\|3` | Seeded vague stories |
| `quit` | Exit |

On phone: after a story finishes, type **`results`** then **`results <slug>`** to read the deliverable. Type **`lessons`** to see self-improvement. SUMMARY also prints a **PREVIEW** of the primary file.

## How it works

1. **Assumptions** — Ambiguity resolved with logged defaults (never Q&A).
2. **Plan** — Numbered steps (`analyze` / `create` / `modify` / `shell` / `verify` / `reflect`).
3. **Execute** — Progress + checkpoints; retries on failure; never stalls on humans.
4. **Verify** — Writes `VERIFICATION.md`.
5. **Reflect** — Lessons into `.fantasia/lessons/`; may add heuristics.
6. **Next run** — Prints **MEMORY INFLUENCE** (lesson ids + heuristic matches).

### Observe memory influence

```bash
npm start -- --local
# fantasia> demo 1
# fantasia> demo 2   # look for MEMORY INFLUENCE + mid-run self-check
# fantasia> memory
```

## Memory layout

```
.fantasia/
  index.json  stories/  plans/  outcomes/  lessons/  heuristics/  checkpoints/
workspace/<slug>/
  assumptions.md  …deliverables…  VERIFICATION.md
```

## Seeded samples

| # | File | Vague story |
|---|------|-------------|
| 1 | `samples/01-todo.txt` | Launch-week todo list |
| 2 | `samples/02-readme.txt` | “Probably need a readme” |
| 3 | `samples/03-api.txt` | Tiny health API |

## Defaults

- Node 18+ / TypeScript via `tsx`
- Green-on-black CLI + mobile web terminal (`viewport-fit=cover`, 16px input, `ret` send button, `visualViewport`)
- Offline-first local executor; Anthropic API and Claude Code optional
- Max 2 retries per step; continue past failures
- Web binds `0.0.0.0`; optional `FANTASIA_TOKEN`

## Project layout

```
fantasia/
  package.json  Makefile  Dockerfile  Procfile  render.yaml
  public/index.html       # mobile web terminal
  src/
    executor/             # local | anthropic | claude
    engine/  memory/  cli/  web/
  samples/  workspace/  .fantasia/
```

## License

MIT
