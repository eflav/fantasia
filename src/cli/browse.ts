/**
 * results / lessons — make deliverables and self-improvement visible on phone.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { FantasiaEngine } from '../engine/runner.js';
import type { LogFn } from '../types/index.js';

const GREEN = '\x1b[32m';
const AMBER = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function d(s: string): string {
  return `${DIM}${s}${RESET}`;
}

const MAX_FILE_BYTES = 8 * 1024;
const KEY_NAMES = [
  'README.md',
  'TODO.md',
  'VERIFICATION.md',
  'assumptions.md',
  'MIDCHECK.md',
  'SUMMARY.md',
  'TESTPLAN.md',
  'BEFORE.md',
  'AFTER.md',
  'PROGRESS.md',
];

function listSlugDirs(workspaceDir: string): { name: string; mtime: number; files: string[] }[] {
  if (!fs.existsSync(workspaceDir)) return [];
  const entries = fs.readdirSync(workspaceDir, { withFileTypes: true });
  const out: { name: string; mtime: number; files: string[] }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('.')) continue;
    const dir = path.join(workspaceDir, e.name);
    let mtime = 0;
    try {
      mtime = fs.statSync(dir).mtimeMs;
    } catch {
      continue;
    }
    let files: string[] = [];
    try {
      files = fs
        .readdirSync(dir)
        .filter((f) => !f.startsWith('.'))
        .sort();
    } catch {
      files = [];
    }
    out.push({ name: e.name, mtime, files });
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function resolveSlug(workspaceDir: string, query: string): string | null {
  const dirs = listSlugDirs(workspaceDir);
  const q = query.toLowerCase();
  const exact = dirs.find((d) => d.name === query || d.name.toLowerCase() === q);
  if (exact) return exact.name;
  const partial = dirs.filter((d) => d.name.toLowerCase().includes(q));
  if (partial.length === 1) return partial[0].name;
  if (partial.length > 1) {
    // prefer shortest / most recent
    return partial[0].name;
  }
  return null;
}

function filesToShow(dir: string): string[] {
  const all = fs.readdirSync(dir).filter((f) => !f.startsWith('.'));
  const keyed = KEY_NAMES.filter((k) => all.includes(k));
  const extras = all
    .filter((f) => /\.(md|cjs|js|html)$/i.test(f) && !keyed.includes(f))
    .sort();
  return [...keyed, ...extras];
}

function printFile(log: LogFn, filePath: string, label: string): void {
  let st: fs.Stats;
  try {
    st = fs.statSync(filePath);
  } catch {
    return;
  }
  if (!st.isFile()) return;
  const raw = fs.readFileSync(filePath);
  const truncated = raw.length > MAX_FILE_BYTES;
  const text = raw.slice(0, MAX_FILE_BYTES).toString('utf8');
  log('');
  log(`${GREEN}── ${label} ──${RESET}${truncated ? ` ${DIM}(truncated ${MAX_FILE_BYTES}B)${RESET}` : ''}`);
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    log(line);
  }
}

/** List recent workspace slugs, or dump key files for one slug. */
export function cmdResults(engine: FantasiaEngine, log: LogFn, query?: string): void {
  const ws = engine.config.workspaceDir;
  const dirs = listSlugDirs(ws);
  if (!dirs.length) {
    log(`${DIM}(no results yet — run a story or demo first)${RESET}`);
    return;
  }

  if (!query) {
    log(`${GREEN}results${RESET}  ${DIM}workspace/ (newest first)${RESET}`);
    log(`${DIM}type: results <slug>  to open one${RESET}`);
    log('');
    for (const d of dirs.slice(0, 20)) {
      const when = new Date(d.mtime).toISOString().replace('T', ' ').slice(0, 19);
      log(`${AMBER}${d.name}${RESET}`);
      log(`  ${DIM}${when}${RESET}  ${d.files.join(', ') || '(empty)'}`);
    }
    if (dirs.length > 20) log(d(`${dirs.length - 20} more…`));
    return;
  }

  const slug = resolveSlug(ws, query);
  if (!slug) {
    log(`${DIM}no match for "${query}"${RESET}`);
    log(`${DIM}try: results${RESET}`);
    return;
  }
  const dir = path.join(ws, slug);
  const files = filesToShow(dir);
  log(`${GREEN}results${RESET}  workspace/${slug}/`);
  log(`${DIM}files: ${files.join(', ') || '(none)'}${RESET}`);
  for (const f of files) {
    printFile(log, path.join(dir, f), f);
  }
  log('');
  log(`${DIM}tip: results   |   lessons${RESET}`);
}

/** Compact recent lessons + top heuristics. */
export function cmdLessons(engine: FantasiaEngine, log: LogFn): void {
  const lessons = engine.memory.listLessons().slice(0, 12);
  const heuristics = [...engine.memory.listHeuristics()].sort((a, b) => b.hits - a.hits).slice(0, 8);

  log(`${GREEN}lessons${RESET}  ${DIM}(self-improvement memory)${RESET}`);
  if (!lessons.length) {
    log(`${DIM}(none yet — finish a run to write lessons)${RESET}`);
  } else {
    for (const l of lessons) {
      log(`${AMBER}[${l.category} w=${l.weight}]${RESET} ${l.text}`);
    }
  }
  log('');
  log(`${GREEN}heuristics${RESET}  ${DIM}(top by hits)${RESET}`);
  if (!heuristics.length) {
    log(`${DIM}(none)${RESET}`);
  } else {
    for (const h of heuristics) {
      log(`${AMBER}/${h.pattern}/${RESET}  hits=${h.hits}`);
      log(`  ${DIM}${h.advice.slice(0, 100)}${h.advice.length > 100 ? '…' : ''}${RESET}`);
    }
  }
  log('');
  log(`${DIM}after a story, SUMMARY previews the deliverable; use results <slug> to read it.${RESET}`);
}

/** First ~20 lines of primary deliverable for SUMMARY preview. */
export function previewPrimaryDeliverable(
  rootDir: string,
  artifacts: string[],
  maxLines = 20
): { path: string; lines: string[] } | null {
  const prefer = ['README.md', 'TODO.md', 'VERIFICATION.md', 'index.html', 'main.cjs', 'server.cjs'];
  const absCandidates: string[] = [];

  for (const name of prefer) {
    for (const art of artifacts) {
      if (art.endsWith('/' + name) || art.endsWith(name)) {
        absCandidates.push(path.join(rootDir, art));
      }
    }
  }
  // also scan slug dirs from artifacts
  for (const art of artifacts) {
    const parts = art.replace(/^workspace\//, '').split('/');
    if (parts.length >= 2) {
      const slugDir = path.join(rootDir, 'workspace', parts[0]);
      for (const name of prefer) {
        absCandidates.push(path.join(slugDir, name));
      }
    }
  }

  const seen = new Set<string>();
  for (const p of absCandidates) {
    if (seen.has(p)) continue;
    seen.add(p);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) continue;
    const text = fs.readFileSync(p, 'utf8');
    const lines = text.replace(/\r\n/g, '\n').split('\n').slice(0, maxLines);
    const rel = path.relative(rootDir, p);
    return { path: rel, lines };
  }
  return null;
}
