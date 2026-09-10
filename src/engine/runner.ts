import * as path from 'path';
import type { EngineConfig, LogFn, Plan, RunOutcome } from '../types/index.js';
import type { MemoryStore } from '../memory/store.js';
import { buildPlan } from './planner.js';
import { normalizeStory } from './assumptions.js';
import { reflect } from './reflect.js';
import { detectBackend, executeStep, type BackendName } from '../executor/index.js';
import { previewPrimaryDeliverable } from '../cli/browse.js';

const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function g(s: string): string {
  return `${GREEN}${s}${RESET}`;
}
function a(s: string): string {
  return `${AMBER}${s}${RESET}`;
}
function d(s: string): string {
  return `${DIM}${s}${RESET}`;
}

export class FantasiaEngine {
  readonly memory: MemoryStore;
  readonly config: EngineConfig;
  private backend: BackendName = 'local';
  private lastPlanId: string | null = null;

  constructor(config: EngineConfig, memory: MemoryStore) {
    this.config = config;
    this.memory = memory;
  }

  async init(): Promise<void> {
    this.backend = await detectBackend(this.config.useClaude);
  }

  getBackend(): BackendName {
    return this.backend;
  }

  getLastPlanId(): string | null {
    return this.lastPlanId;
  }

  async runStory(rawStory: string, log: LogFn, opts?: { resumePlanId?: string }): Promise<RunOutcome> {
    await this.init();
    const startedAt = new Date().toISOString();
    let plan: Plan;
    let storyRaw = rawStory;
    let startIndex = 0;

    if (opts?.resumePlanId) {
      const cp = this.memory.getCheckpoint(opts.resumePlanId);
      const existing = this.memory.getPlan(opts.resumePlanId);
      if (!cp || !existing) {
        throw new Error(`no checkpoint for plan ${opts.resumePlanId}`);
      }
      plan = cp.plan;
      startIndex = cp.stepIndex;
      const story = this.memory.getStory(plan.storyId);
      storyRaw = story?.raw || rawStory;
      log(a(`* recovering from checkpoint @ step ${startIndex + 1}/${plan.steps.length}`));
    } else {
      const normalized = normalizeStory(rawStory);
      const story = this.memory.saveStory(rawStory, normalized);
      const built = buildPlan(story.id, rawStory, this.memory);
      plan = built.plan;
      this.memory.savePlan(plan);

      log('');
      log(g('── ASSUMPTIONS ──'));
      for (const as of built.assumptions) {
        log(`${a(as.id)}  ${as.text}`);
        log(d(`      rationale: ${as.rationale}`));
      }
      log('');

      log(g('── MEMORY INFLUENCE ──'));
      if (built.plan.influencedBy.length) {
        const nLess = built.lessonsUsed.length;
        const nHeur = built.matched.length;
        log(
          a(
            `self-improve: applying ${nLess} lesson${nLess === 1 ? '' : 's'} / ${nHeur} heuristic${nHeur === 1 ? '' : 's'} from prior runs`
          )
        );
      }
      if (built.matched.length || built.lessonsUsed.length) {
        for (const h of built.matched) {
          log(`${a('heur')} ${h.id}  /${h.pattern}/ (hits=${h.hits})`);
          log(d(`      ${h.advice}`));
        }
        for (const l of built.lessonsUsed) {
          log(`${a('less')} ${l.id}  [w=${l.weight} ${l.category}]`);
          log(d(`      ${l.text}`));
        }
      } else {
        log(d('(no heuristics matched and no lessons yet — seed heuristics load on first boot)'));
      }
      log(d(`influencedBy: [${built.plan.influencedBy.join(', ') || 'none'}]`));
      log(d('tip: type lessons   |   after run: results'));
      log('');

      log(g('── PLAN ──'));
      log(`${BOLD}${plan.title}${RESET}`);
      log(d(`plan id: ${plan.id}  backend: ${this.backend}`));
      for (const s of plan.steps) {
        log(`  ${a(s.id)}. [${s.kind}] ${s.title}`);
        log(d(`      ${s.action}${s.artifact ? ' → ' + s.artifact : ''}`));
      }
      log('');
      log(g('── EXECUTE ──'));
    }

    this.lastPlanId = plan.id;
    const artifacts: string[] = [];
    const failedSteps: string[] = [];

    const ctx = {
      rootDir: this.config.rootDir,
      workspaceDir: this.config.workspaceDir,
      plan,
      assumptions: plan.assumptions,
      storyRaw,
    };

    for (let i = startIndex; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      step.status = 'running';
      this.checkpoint(plan, i);
      log(`${d('make[1]:')} Entering \`${step.id}\'`);
      log(`${a('>>')} ${step.title}`);

      let ok = false;
      let lastErr = '';
      const maxAttempts = this.config.maxRetries + 1;
      for (let attempt = 1; attempt <= maxAttempts && !ok; attempt++) {
        try {
          if (step.kind === 'reflect') {
            step.output = 'pending reflection';
            step.status = 'done';
            ok = true;
            log(`${g('ok')}   ${step.id} (deferred to post-run reflect)`);
            break;
          }
          const output = await executeStep(this.backend, ctx, step);
          step.output = output;
          step.status = 'done';
          if (step.artifact) artifacts.push(step.artifact);
          ok = true;
          log(`${g('ok')}   ${step.id}: ${output}`);
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
          step.retries = attempt;
          if (attempt < maxAttempts) {
            log(`${a('retry')} ${step.id} attempt ${attempt}/${this.config.maxRetries}: ${lastErr.split('\n')[0]}`);
          } else {
            step.status = 'failed';
            step.error = lastErr;
            failedSteps.push(step.id);
            log(`${a('FAIL')} ${step.id}: ${lastErr.split('\n')[0]}`);
          }
        }
      }
      this.memory.savePlan(plan);
      this.checkpoint(plan, i + 1);
    }

    const success = failedSteps.length === 0;
    const finishedAt = new Date().toISOString();
    const summary = success
      ? `Completed ${plan.steps.length} steps. Artifacts: ${artifacts.length}.`
      : `Finished with ${failedSteps.length} failed step(s): ${failedSteps.join(', ')}. Artifacts: ${artifacts.length}.`;

    const outcome: RunOutcome = {
      planId: plan.id,
      storyId: plan.storyId,
      success,
      startedAt,
      finishedAt,
      artifacts: [...new Set(artifacts)],
      summary,
      failedSteps,
    };
    this.memory.saveOutcome(outcome);

    // Reflect
    log('');
    log(g('── REFLECT ──'));
    const lessons = reflect(this.memory, plan, outcome);
    for (const l of lessons) {
      log(`${a('+lesson')} [${l.category} w=${l.weight}] ${l.text}`);
    }
    // Mark reflect step done properly
    const reflectStep = plan.steps.find((s) => s.kind === 'reflect');
    if (reflectStep) {
      reflectStep.status = 'done';
      reflectStep.output = `wrote ${lessons.length} lessons`;
      this.memory.savePlan(plan);
    }

    this.memory.clearCheckpoint(plan.id);

    log('');
    log(g('── SUMMARY ──'));
    log(success ? g('STATUS  OK') : a('STATUS  DEGRADED'));
    log(`plan    ${plan.id}`);
    log(`backend ${this.backend}`);
    log(`steps   ${plan.steps.filter((s) => s.status === 'done').length}/${plan.steps.length}`);
    log(`arts    ${outcome.artifacts.length}`);
    for (const art of outcome.artifacts) {
      log(d(`  - ${art}`));
    }
    log(`memory  updated under ${path.relative(this.config.rootDir, this.memory.root) || '.fantasia/'}`);
    log(d(summary));
    if (success) {
      const preview = previewPrimaryDeliverable(this.config.rootDir, outcome.artifacts, 20);
      if (preview) {
        log('');
        log(g('── PREVIEW ──'));
        log(d(preview.path + '  (first lines — full text: results <slug>)'));
        for (const line of preview.lines) log(line);
      }
    }
    log('');
    log(g('memory updated. next plan will cite lessons/heuristics under MEMORY INFLUENCE.'));
    log(d('open deliverables:  results          |  self-improve:  lessons'));
    log('');

    return outcome;
  }

  private checkpoint(plan: Plan, stepIndex: number): void {
    this.memory.saveCheckpoint({
      planId: plan.id,
      storyId: plan.storyId,
      stepIndex,
      plan,
      updatedAt: new Date().toISOString(),
    });
  }

  statusText(): string {
    const cps = this.memory.listCheckpoints();
    const outcomes = this.memory.listOutcomes();
    const last = outcomes[outcomes.length - 1];
    const lines = [
      `backend:     ${this.backend}`,
      `memory:      ${this.memory.root}`,
      `workspace:   ${this.config.workspaceDir}`,
      `stories:     ${this.memory.listStories().length}`,
      `outcomes:    ${outcomes.length}`,
      `checkpoints: ${cps.length}`,
      `last plan:   ${this.lastPlanId || last?.planId || '(none)'}`,
      `last result: ${last ? (last.success ? 'OK' : 'DEGRADED') : '(none)'}`,
    ];
    if (cps.length) {
      lines.push('recoverable:');
      for (const c of cps) {
        lines.push(`  ${c.planId} @ step ${c.stepIndex + 1}`);
      }
    }
    return lines.join('\n');
  }
}
