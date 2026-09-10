import type { PlanStep } from '../types/index.js';
import { executeLocal, type ExecContext } from './local.js';
import { claudeAvailable, executeClaude } from './claude.js';
import { anthropicConfigured, executeAnthropic } from './anthropic.js';

export type BackendName = 'local' | 'claude' | 'anthropic';

/**
 * Backend priority:
 *   1. ANTHROPIC_API_KEY → anthropic
 *   2. `claude` CLI (unless forceLocal) → claude
 *   3. local heuristics
 */
export async function detectBackend(preferRemote: boolean): Promise<BackendName> {
  if (!preferRemote) return 'local';
  if (anthropicConfigured()) return 'anthropic';
  if (await claudeAvailable()) return 'claude';
  return 'local';
}

export async function executeStep(
  backend: BackendName,
  ctx: ExecContext,
  step: PlanStep
): Promise<string> {
  if (backend === 'anthropic') return executeAnthropic(ctx, step);
  if (backend === 'claude') return executeClaude(ctx, step);
  return executeLocal(ctx, step);
}

export { claudeAvailable, anthropicConfigured, type ExecContext };
