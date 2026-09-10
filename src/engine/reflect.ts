import type { Lesson, Plan, RunOutcome } from '../types/index.js';
import type { MemoryStore } from '../memory/store.js';

/**
 * After each run, reflect and write lessons that observably influence future plans.
 */
export function reflect(
  memory: MemoryStore,
  plan: Plan,
  outcome: RunOutcome
): Lesson[] {
  const created: Lesson[] = [];

  const add = (
    text: string,
    category: Lesson['category'],
    weight: number
  ) => {
    const lesson = memory.addLesson({
      storyId: plan.storyId,
      planId: plan.id,
      text,
      category,
      weight,
    });
    created.push(lesson);
  };

  if (outcome.success) {
    add(
      `Domain pattern from "${plan.title}" succeeded — reuse similar step shape next time.`,
      'planning',
      2
    );
    add(
      'Always end with an explicit verify step that writes a verification report.',
      'verification',
      3
    );
    if (plan.steps.some((s) => s.kind === 'shell' && s.status === 'done')) {
      add(
        'Shell/smoke steps that dry-run without network binds are reliable; prefer them.',
        'execution',
        2
      );
    }
    add(
      'Keep deliverables in a slug-named subdirectory under workspace/ for isolation.',
      'general',
      1
    );
  } else {
    add(
      `Run failed on steps: ${outcome.failedSteps.join(', ') || 'unknown'}. Prefer smaller incremental steps and mid-run self-check.`,
      'planning',
      4
    );
    add(
      'On failure, retry with create-before-modify ordering and write MIDCHECK.md.',
      'execution',
      3
    );
    add(
      'Failed runs should still leave partial artifacts and a verification report noting gaps.',
      'verification',
      2
    );
  }

  // Promote a heuristic from successful domains
  if (outcome.success) {
    const title = plan.title.toLowerCase();
    if (title.startsWith('todo:')) {
      memory.addHeuristic(
        'todo|checklist',
        'Successful pattern: TODO.md → mark done → completion log → VERIFICATION.md'
      );
    } else if (title.startsWith('docs:')) {
      memory.addHeuristic(
        'readme|docs',
        'Successful pattern: README scaffold → fill sections → verify headings'
      );
    } else if (title.startsWith('api:')) {
      memory.addHeuristic(
        'api|server|endpoint',
        'Successful pattern: server stub + smoke.js dry-run + verification'
      );
    }
  }

  return created;
}
