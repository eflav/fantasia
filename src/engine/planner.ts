import type { Assumption, Heuristic, Lesson, Plan, PlanStep } from '../types/index.js';
import type { MemoryStore } from '../memory/store.js';
import { deriveAssumptions, normalizeStory } from './assumptions.js';

function step(id: string, title: string, action: string, kind: PlanStep['kind'], artifact?: string): PlanStep {
  return { id, title, action, kind, status: 'pending', artifact, retries: 0 };
}

function detectDomain(story: string): string {
  const s = story.toLowerCase();
  if (/todo|task|checklist|list/.test(s)) return 'todo';
  if (/readme|document|docs|write.?up|spec/.test(s)) return 'docs';
  if (/api|endpoint|http|rest|server/.test(s)) return 'api';
  if (/script|automate|cli|tool|command/.test(s)) return 'script';
  if (/refactor|clean|improve|organize/.test(s)) return 'refactor';
  if (/test|qa|verify|check/.test(s)) return 'test';
  if (/ui|page|frontend|web|html|dashboard/.test(s)) return 'ui';
  return 'generic';
}

function slugify(story: string): string {
  return story
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'deliverable';
}

/**
 * Build a numbered plan from a vague story, memory lessons, and matched heuristics.
 * Influence is recorded on the plan for observability.
 */
export function buildPlan(
  storyId: string,
  rawStory: string,
  memory: MemoryStore
): { plan: Plan; assumptions: Assumption[]; matched: Heuristic[]; lessonsUsed: Lesson[] } {
  const normalized = normalizeStory(rawStory);
  const assumptions = deriveAssumptions(normalized);
  const matched = memory.matchHeuristics(normalized);
  const lessons = memory.listLessons().filter((l) => l.weight >= 1).slice(0, 8);
  const domain = detectDomain(normalized);
  const slug = slugify(normalized);
  const influencedBy: string[] = [
    ...matched.map((h) => h.id),
    ...lessons.map((l) => l.id),
  ];

  // Bump heuristic hits so influence is durable
  for (const h of matched) {
    memory.bumpHeuristic(h.id);
    h.hits += 1;
  }

  const steps: PlanStep[] = [];
  let i = 1;
  const add = (title: string, action: string, kind: PlanStep['kind'], artifact?: string) => {
    steps.push(step(`S${i}`, title, action, kind, artifact));
    i++;
  };

  add('Normalize & record story', `Persist story ${storyId} and domain=${domain}`, 'analyze');
  add(
    'Materialize assumptions',
    `Write assumptions.md (${assumptions.length} assumptions)`,
    'create',
    `workspace/${slug}/assumptions.md`
  );

  // Lesson-driven early verify scaffolding
  const wantsEarlyVerify = lessons.some((l) => /verify|check|report/i.test(l.text));
  const wantsSmallSteps = lessons.some((l) => /small|incremental|chunk/i.test(l.text));
  const wantsReadme = matched.some((h) => /readme|document/i.test(h.pattern)) || domain === 'docs';

  switch (domain) {
    case 'todo':
      add('Draft checklist', 'Create TODO.md with derived items', 'create', `workspace/${slug}/TODO.md`);
      add('Execute items', 'Mark each checklist item done with notes', 'modify', `workspace/${slug}/TODO.md`);
      add('Write completion log', 'Append done-log section', 'modify', `workspace/${slug}/TODO.md`);
      break;
    case 'docs':
      add('Scaffold README', 'Create README with required sections', 'create', `workspace/${slug}/README.md`);
      add('Fill content from story', 'Expand sections using assumptions', 'modify', `workspace/${slug}/README.md`);
      break;
    case 'api':
      add('Scaffold handler', 'Create server stub module', 'create', `workspace/${slug}/server.cjs`);
      add('Smoke script', 'Create smoke-test.cjs', 'create', `workspace/${slug}/smoke.cjs`);
      add('Dry-run smoke', 'Execute smoke script (no bind)', 'shell', `workspace/${slug}/smoke.cjs`);
      break;
    case 'script':
      add('Write script', 'Create executable tool script', 'create', `workspace/${slug}/tool.cjs`);
      add('Add --help', 'Ensure help text exists', 'modify', `workspace/${slug}/tool.cjs`);
      add('Dry-run', 'Run script once', 'shell', `workspace/${slug}/tool.cjs`);
      break;
    case 'refactor':
      add('Capture before snapshot', 'Write BEFORE.md notes', 'create', `workspace/${slug}/BEFORE.md`);
      add('Produce improved copy', 'Write AFTER.md improved version', 'create', `workspace/${slug}/AFTER.md`);
      add('Diff summary', 'Write SUMMARY.md before/after', 'create', `workspace/${slug}/SUMMARY.md`);
      break;
    case 'test':
      add('Write test plan', 'Create TESTPLAN.md', 'create', `workspace/${slug}/TESTPLAN.md`);
      add('Write assertion script', 'Create assert.cjs', 'create', `workspace/${slug}/assert.cjs`);
      add('Run assertions', 'Execute assert.cjs', 'shell', `workspace/${slug}/assert.cjs`);
      break;
    case 'ui':
      add('Scaffold HTML page', 'Create index.html with inline CSS', 'create', `workspace/${slug}/index.html`);
      add('Add interactivity stub', 'Inline minimal JS', 'modify', `workspace/${slug}/index.html`);
      break;
    default:
      add('Scaffold project skeleton', 'Create main deliverable file', 'create', `workspace/${slug}/main.cjs`);
      if (wantsReadme || true) {
        add('Write companion README', 'Document what was built', 'create', `workspace/${slug}/README.md`);
      }
      if (wantsSmallSteps) {
        add('Incremental note', 'Write PROGRESS.md checkpoint notes', 'create', `workspace/${slug}/PROGRESS.md`);
      }
      add('Smoke invoke', 'Run main.cjs once', 'shell', `workspace/${slug}/main.cjs`);
      break;
  }

  if (wantsEarlyVerify) {
    // Insert an intermediate self-check before final verify (lesson influence — observable)
    add(
      'Mid-run self-check (lesson-driven)',
      'Confirm primary artifacts exist before final verify',
      'verify',
      `workspace/${slug}/MIDCHECK.md`
    );
  }

  add(
    'Verify deliverables',
    'Write VERIFICATION.md and assert artifacts exist',
    'verify',
    `workspace/${slug}/VERIFICATION.md`
  );
  add('Reflect & update memory', 'Extract lessons; update heuristics', 'reflect');

  const title =
    domain === 'generic'
      ? `Deliver: ${normalized.slice(0, 60)}`
      : `${domain}: ${normalized.slice(0, 50)}`;

  const plan: Plan = {
    id: memory.newId('plan'),
    storyId,
    title,
    assumptions,
    steps,
    influencedBy,
    createdAt: new Date().toISOString(),
  };

  return { plan, assumptions, matched, lessonsUsed: lessons };
}
