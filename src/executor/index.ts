import type { PlanStep } from '../types/index.js';
import { executeLocal, type ExecContext } from './local.js';
import { claudeAvailable, executeClaude } from './claude.js';

export type BackendName = 'local' | 'claude';

export async function detectBackend(preferClaude: boolean): Promise<BackendName> {
  if (preferClaude && (await claudeAvailable())) return 'claude';
  return 'local';
}

export async function executeStep(
  backend: BackendName,
  ctx: ExecContext,
  step: PlanStep
): Promise<string> {
  if (backend === 'claude') return executeClaude(ctx, step);
  return executeLocal(ctx, step);
}

export { claudeAvailable, type ExecContext };
