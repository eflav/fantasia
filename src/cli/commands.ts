import type { FantasiaEngine } from '../engine/runner.js';
import type { LogFn } from '../types/index.js';
import { cmdLessons, cmdResults } from './browse.js';

const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

export const HELP = `
${GREEN}commands${RESET}
  help                 show this help
  results              list recent workspace deliverables
  results <slug>       show file contents for one result
  lessons              recent lessons + top heuristics
  history              list past stories / outcomes
  memory               dump durable memory summary
  status               backend, checkpoints, last run
  retry                resume last checkpoint (if any)
  demo                 run seeded sample stories end-to-end
  demo 1|2|3           run one sample
  quit / exit / :q     leave the REPL

${GREEN}usage${RESET}
  Paste any vague user story and press Enter (or ret on phone).
  Fantasia prints assumptions, a plan, executes, verifies,
  reflects, and updates .fantasia/ — without asking questions.
  After a run, SUMMARY previews the deliverable. Then:
    results            — see what was written
    results <slug>     — read it
    lessons            — see self-improvement memory

${GREEN}self-improvement${RESET}
  Each finished run writes lessons. The next plan shows
  ${AMBER}MEMORY INFLUENCE${RESET} plus a plain line:
    self-improve: applying N lessons / heuristics from prior runs
  Use \`lessons\` anytime; use \`results\` to open artifacts.

${GREEN}backends${RESET}
  Priority: ANTHROPIC_API_KEY → anthropic API;
  else \`claude\` CLI (desktop) → claude;
  else local heuristics (always available, no keys).
  Force local: npm start -- --local
  Phone/web: set ANTHROPIC_API_KEY on the host; Claude Code CLI
  is optional desktop-only and not needed for iPhone access.
`.trim();

export const SAMPLES: { id: number; title: string; story: string }[] = [
  {
    id: 1,
    title: 'vague todo',
    story:
      'Need some kind of todo list for the launch week stuff, you know what I mean, just get it sorted.',
  },
  {
    id: 2,
    title: 'vague docs',
    story:
      'We should probably have a readme or something so people can figure out how to run this project.',
  },
  {
    id: 3,
    title: 'vague api',
    story:
      'Maybe a tiny API endpoint that returns health or status? Keep it simple, whatever works.',
  },
];

export async function handleCommand(
  line: string,
  engine: FantasiaEngine,
  log: LogFn
): Promise<'continue' | 'quit' | 'handled'> {
  const trimmed = line.trim();
  if (!trimmed) return 'handled';

  const lower = trimmed.toLowerCase();

  if (lower === 'quit' || lower === 'exit' || lower === ':q') {
    log(`${DIM}bye.${RESET}`);
    return 'quit';
  }
  if (lower === 'help' || lower === '?') {
    log(HELP);
    return 'handled';
  }
  if (lower === 'memory') {
    log(engine.memory.summary());
    return 'handled';
  }
  if (lower === 'status') {
    log(engine.statusText());
    return 'handled';
  }
  if (lower === 'lessons') {
    cmdLessons(engine, log);
    return 'handled';
  }
  if (lower === 'results' || lower.startsWith('results ')) {
    const q = trimmed.slice('results'.length).trim();
    cmdResults(engine, log, q || undefined);
    return 'handled';
  }
  if (lower === 'history') {
    const stories = engine.memory.listStories();
    if (!stories.length) {
      log(`${DIM}(no stories yet)${RESET}`);
      return 'handled';
    }
    for (const s of stories) {
      const outcomes = s.outcomeIds
        .map((oid) => engine.memory.getOutcome(oid))
        .filter(Boolean);
      const last = outcomes[outcomes.length - 1];
      const flag = last ? (last.success ? 'OK' : 'DEGRADED') : '—';
      log(`${AMBER}${s.id}${RESET}  [${flag}]  ${s.normalized.slice(0, 72)}`);
    }
    return 'handled';
  }
  if (lower === 'retry') {
    const cps = engine.memory.listCheckpoints();
    if (!cps.length) {
      log(`${DIM}no checkpoints to resume${RESET}`);
      return 'handled';
    }
    const cp = cps[cps.length - 1];
    await engine.runStory('(resume)', log, { resumePlanId: cp.planId });
    return 'handled';
  }
  if (lower === 'demo' || /^demo\s+[123]$/.test(lower)) {
    const which = lower === 'demo' ? null : Number(lower.split(/\s+/)[1]);
    const picks = which ? SAMPLES.filter((s) => s.id === which) : SAMPLES;
    for (const sample of picks) {
      log('');
      log(`${GREEN}══ demo ${sample.id}: ${sample.title} ══${RESET}`);
      log(`${DIM}${sample.story}${RESET}`);
      await engine.runStory(sample.story, log);
    }
    return 'handled';
  }

  // Otherwise treat as a user story
  await engine.runStory(trimmed, log);
  return 'handled';
}
