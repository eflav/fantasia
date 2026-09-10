import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import type { PlanStep } from '../types/index.js';
import type { ExecContext } from './local.js';
import { executeLocal } from './local.js';

const execFileAsync = promisify(execFile);

export async function claudeAvailable(): Promise<boolean> {
  try {
    await execFileAsync('claude', ['--version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Optional Claude Code backend. If `claude` CLI works, ask it to perform
 * the step in the workspace; on any failure, fall back to local heuristics.
 */
export async function executeClaude(ctx: ExecContext, step: PlanStep): Promise<string> {
  // For analyze/reflect we still use local
  if (step.kind === 'analyze' || step.kind === 'reflect') {
    return executeLocal(ctx, step);
  }

  const prompt = [
    'You are Fantasia\'s code executor. Complete ONE step. Do not ask questions.',
    `Step: ${step.title}`,
    `Action: ${step.action}`,
    step.artifact ? `Artifact path (relative to project root): ${step.artifact}` : '',
    `Story: ${ctx.storyRaw.slice(0, 400)}`,
    'Assumptions:',
    ...ctx.assumptions.map((a) => `- ${a.text}`),
    'Write real files. Prefer the artifact path. Exit when done.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const { stdout, stderr } = await execFileAsync(
      'claude',
      ['-p', prompt, '--output-format', 'text'],
      {
        cwd: ctx.rootDir,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024,
        env: process.env,
      }
    );
    const out = (stdout || stderr || '').trim().slice(0, 500);
    // If artifact expected, ensure something exists; else fall back
    if (step.artifact) {
      const p = step.artifact.startsWith('workspace/')
        ? `${ctx.rootDir}/${step.artifact}`
        : step.artifact;
      if (!fs.existsSync(p) && step.kind !== 'shell') {
        return executeLocal(ctx, step);
      }
    }
    return out || `claude completed: ${step.title}`;
  } catch {
    return executeLocal(ctx, step);
  }
}
