import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PlanStep } from '../types/index.js';
import type { ExecContext } from './local.js';
import { executeLocal } from './local.js';

const execFileAsync = promisify(execFile);

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

interface ApiFile {
  path: string;
  content: string;
}

interface ApiResponse {
  files?: ApiFile[];
  shell?: string;
  summary?: string;
}

function absPath(ctx: ExecContext, rel: string): string {
  if (rel.startsWith('workspace/')) return path.join(ctx.rootDir, rel);
  if (path.isAbsolute(rel)) return rel;
  return path.join(ctx.rootDir, rel);
}

function extractJson(text: string): ApiResponse | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : text.trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as ApiResponse;
  } catch {
    return null;
  }
}

async function callAnthropic(prompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = (data.content || [])
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text!)
    .join('\n');
  if (!text.trim()) throw new Error('Anthropic empty response');
  return text;
}

function buildPrompt(ctx: ExecContext, step: PlanStep): string {
  return [
    'You are Fantasia\'s code executor. Complete ONE workflow step.',
    'Do NOT ask clarifying questions. Use the assumptions as given.',
    'Respond with ONLY a JSON object (optional markdown fence) of shape:',
    '{ "files": [{ "path": "relative/path", "content": "..." }], "shell": "optional cmd", "summary": "one line" }',
    'Paths must be under workspace/. Prefer the artifact path when given.',
    'For CommonJS scripts that use require(), use a .cjs extension.',
    'For shell steps, you may omit files and set "shell", or write files then set shell.',
    '',
    `Step title: ${step.title}`,
    `Step kind: ${step.kind}`,
    `Action: ${step.action}`,
    step.artifact ? `Artifact path: ${step.artifact}` : '',
    `Story: ${ctx.storyRaw.slice(0, 500)}`,
    'Assumptions:',
    ...ctx.assumptions.map((a) => `- ${a.id}: ${a.text}`),
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Optional Anthropic Messages API backend (ANTHROPIC_API_KEY).
 * On any failure, falls back to the local heuristic executor.
 */
export async function executeAnthropic(
  ctx: ExecContext,
  step: PlanStep
): Promise<string> {
  if (step.kind === 'analyze' || step.kind === 'reflect') {
    return executeLocal(ctx, step);
  }

  try {
    const text = await callAnthropic(buildPrompt(ctx, step));
    const parsed = extractJson(text);

    if (!parsed || (!parsed.files?.length && !parsed.shell && step.kind !== 'verify')) {
      // Model didn't return usable JSON — local fallback
      return executeLocal(ctx, step);
    }

    if (parsed.files?.length) {
      for (const f of parsed.files) {
        const target = absPath(ctx, f.path);
        if (!target.startsWith(ctx.workspaceDir) && !target.includes(`${path.sep}workspace${path.sep}`)) {
          // refuse writes outside workspace
          continue;
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, f.content, 'utf8');
      }
    }

    // Ensure expected artifact exists; if not, local fill-in
    if (step.artifact && step.kind !== 'shell') {
      const p = absPath(ctx, step.artifact);
      if (!fs.existsSync(p)) {
        return executeLocal(ctx, step);
      }
    }

    if (parsed.shell || step.kind === 'shell') {
      if (step.kind === 'shell' && step.artifact) {
        const p = absPath(ctx, step.artifact);
        if (!fs.existsSync(p)) {
          await executeLocal(ctx, { ...step, kind: 'create' });
        }
        const { stdout, stderr } = await execFileAsync(process.execPath, [p], {
          cwd: path.dirname(p),
          timeout: 30000,
          env: { ...process.env, FANTASIA_DRY: '1' },
        });
        const out = (stdout || stderr || '').trim().split('\n')[0] || 'ok';
        return parsed.summary || `anthropic+shell: ${out}`;
      }
      if (parsed.shell) {
        // Only allow simple node invocations under workspace — otherwise local
        if (!/^node\s+workspace\//.test(parsed.shell.trim())) {
          // ignore unsafe shell; if create already wrote files, summarize
          return parsed.summary || `anthropic wrote ${(parsed.files || []).length} file(s)`;
        }
      }
    }

    // verify / midcheck: prefer local verification so checks stay hermetic
    if (step.kind === 'verify') {
      return executeLocal(ctx, step);
    }

    return (
      parsed.summary ||
      `anthropic: ${step.title} (${(parsed.files || []).length} file(s))`
    );
  } catch {
    return executeLocal(ctx, step);
  }
}
