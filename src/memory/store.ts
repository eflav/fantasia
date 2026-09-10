import * as fs from 'fs';
import * as path from 'path';
import type {
  StoryRecord,
  Plan,
  RunOutcome,
  Lesson,
  Heuristic,
  Checkpoint,
  MemoryIndex,
} from '../types/index.js';

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, data: unknown): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function id(prefix: string): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${r}`;
}

export class MemoryStore {
  readonly root: string;
  private storiesDir: string;
  private lessonsDir: string;
  private heuristicsDir: string;
  private checkpointsDir: string;
  private outcomesDir: string;
  private plansDir: string;
  private indexPath: string;

  constructor(memoryDir: string) {
    this.root = memoryDir;
    this.storiesDir = path.join(memoryDir, 'stories');
    this.lessonsDir = path.join(memoryDir, 'lessons');
    this.heuristicsDir = path.join(memoryDir, 'heuristics');
    this.checkpointsDir = path.join(memoryDir, 'checkpoints');
    this.outcomesDir = path.join(memoryDir, 'outcomes');
    this.plansDir = path.join(memoryDir, 'plans');
    this.indexPath = path.join(memoryDir, 'index.json');
    this.bootstrap();
  }

  private bootstrap(): void {
    for (const d of [
      this.storiesDir,
      this.lessonsDir,
      this.heuristicsDir,
      this.checkpointsDir,
      this.outcomesDir,
      this.plansDir,
    ]) {
      ensureDir(d);
    }
    if (!fs.existsSync(this.indexPath)) {
      writeJson(this.indexPath, {
        stories: [],
        lessons: [],
        heuristics: [],
        outcomes: [],
        version: 1,
      } satisfies MemoryIndex);
    }
    // Seed default heuristics once
    const idx = this.getIndex();
    if (idx.heuristics.length === 0) {
      this.seedHeuristics();
    }
  }

  private seedHeuristics(): void {
    const seeds: Omit<Heuristic, 'id' | 'hits' | 'createdAt' | 'updatedAt'>[] = [
      {
        pattern: 'todo|task|list|checklist',
        advice: 'Produce a markdown checklist artifact; verify by counting unchecked items = 0 after mark-done step.',
      },
      {
        pattern: 'readme|document|docs|write.?up',
        advice: 'Create README.md with Install, Run, and Assumptions sections; verify file exists and has >= 3 headings.',
      },
      {
        pattern: 'api|endpoint|http|server',
        advice: 'Scaffold a minimal HTTP handler stub and a smoke-test script; verify by syntax check or dry-run.',
      },
      {
        pattern: 'script|automate|cli|tool',
        advice: 'Write an executable shell or node script under workspace/; verify with --help or dry-run flag.',
      },
      {
        pattern: 'refactor|clean|improve',
        advice: 'Prefer additive artifacts (diff notes + improved copy) over destructive edits; verify with a before/after summary.',
      },
      {
        pattern: 'test|verify|qa',
        advice: 'Always end with an explicit verify step that writes a verification report.',
      },
    ];
    for (const s of seeds) {
      this.addHeuristic(s.pattern, s.advice);
    }
  }

  getIndex(): MemoryIndex {
    return readJson<MemoryIndex>(this.indexPath, {
      stories: [],
      lessons: [],
      heuristics: [],
      outcomes: [],
      version: 1,
    });
  }

  private saveIndex(idx: MemoryIndex): void {
    writeJson(this.indexPath, idx);
  }

  newId(prefix: string): string {
    return id(prefix);
  }

  // --- Stories ---
  saveStory(raw: string, normalized: string): StoryRecord {
    const record: StoryRecord = {
      id: id('story'),
      raw,
      normalized,
      createdAt: new Date().toISOString(),
      planIds: [],
      outcomeIds: [],
    };
    writeJson(path.join(this.storiesDir, `${record.id}.json`), record);
    const idx = this.getIndex();
    idx.stories.push(record.id);
    this.saveIndex(idx);
    return record;
  }

  getStory(sid: string): StoryRecord | null {
    return readJson<StoryRecord | null>(path.join(this.storiesDir, `${sid}.json`), null);
  }

  updateStory(record: StoryRecord): void {
    writeJson(path.join(this.storiesDir, `${record.id}.json`), record);
  }

  listStories(): StoryRecord[] {
    return this.getIndex()
      .stories.map((sid) => this.getStory(sid))
      .filter((s): s is StoryRecord => !!s);
  }

  // --- Plans ---
  savePlan(plan: Plan): void {
    writeJson(path.join(this.plansDir, `${plan.id}.json`), plan);
    const story = this.getStory(plan.storyId);
    if (story && !story.planIds.includes(plan.id)) {
      story.planIds.push(plan.id);
      this.updateStory(story);
    }
  }

  getPlan(pid: string): Plan | null {
    return readJson<Plan | null>(path.join(this.plansDir, `${pid}.json`), null);
  }

  // --- Outcomes ---
  saveOutcome(outcome: RunOutcome): void {
    writeJson(path.join(this.outcomesDir, `${outcome.planId}.json`), outcome);
    const idx = this.getIndex();
    if (!idx.outcomes.includes(outcome.planId)) {
      idx.outcomes.push(outcome.planId);
      this.saveIndex(idx);
    }
    const story = this.getStory(outcome.storyId);
    if (story && !story.outcomeIds.includes(outcome.planId)) {
      story.outcomeIds.push(outcome.planId);
      this.updateStory(story);
    }
  }

  getOutcome(planId: string): RunOutcome | null {
    return readJson<RunOutcome | null>(path.join(this.outcomesDir, `${planId}.json`), null);
  }

  listOutcomes(): RunOutcome[] {
    return this.getIndex()
      .outcomes.map((oid) => this.getOutcome(oid))
      .filter((o): o is RunOutcome => !!o);
  }

  // --- Lessons ---
  addLesson(partial: Omit<Lesson, 'id' | 'createdAt'>): Lesson {
    const lesson: Lesson = {
      ...partial,
      id: id('lesson'),
      createdAt: new Date().toISOString(),
    };
    writeJson(path.join(this.lessonsDir, `${lesson.id}.json`), lesson);
    const idx = this.getIndex();
    idx.lessons.push(lesson.id);
    this.saveIndex(idx);
    return lesson;
  }

  getLesson(lid: string): Lesson | null {
    return readJson<Lesson | null>(path.join(this.lessonsDir, `${lid}.json`), null);
  }

  listLessons(): Lesson[] {
    return this.getIndex()
      .lessons.map((lid) => this.getLesson(lid))
      .filter((l): l is Lesson => !!l)
      .sort((a, b) => b.weight - a.weight);
  }

  // --- Heuristics ---
  addHeuristic(pattern: string, advice: string): Heuristic {
    const now = new Date().toISOString();
    const h: Heuristic = {
      id: id('heur'),
      pattern,
      advice,
      hits: 0,
      createdAt: now,
      updatedAt: now,
    };
    writeJson(path.join(this.heuristicsDir, `${h.id}.json`), h);
    const idx = this.getIndex();
    idx.heuristics.push(h.id);
    this.saveIndex(idx);
    return h;
  }

  getHeuristic(hid: string): Heuristic | null {
    return readJson<Heuristic | null>(path.join(this.heuristicsDir, `${hid}.json`), null);
  }

  bumpHeuristic(hid: string): void {
    const h = this.getHeuristic(hid);
    if (!h) return;
    h.hits += 1;
    h.updatedAt = new Date().toISOString();
    writeJson(path.join(this.heuristicsDir, `${h.id}.json`), h);
  }

  listHeuristics(): Heuristic[] {
    return this.getIndex()
      .heuristics.map((hid) => this.getHeuristic(hid))
      .filter((h): h is Heuristic => !!h);
  }

  matchHeuristics(text: string): Heuristic[] {
    const lower = text.toLowerCase();
    const matched: Heuristic[] = [];
    for (const h of this.listHeuristics()) {
      try {
        const re = new RegExp(h.pattern, 'i');
        if (re.test(lower)) matched.push(h);
      } catch {
        if (lower.includes(h.pattern.toLowerCase())) matched.push(h);
      }
    }
    return matched;
  }

  // --- Checkpoints ---
  saveCheckpoint(cp: Checkpoint): void {
    writeJson(path.join(this.checkpointsDir, `${cp.planId}.json`), cp);
  }

  getCheckpoint(planId: string): Checkpoint | null {
    return readJson<Checkpoint | null>(path.join(this.checkpointsDir, `${planId}.json`), null);
  }

  clearCheckpoint(planId: string): void {
    const p = path.join(this.checkpointsDir, `${planId}.json`);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  listCheckpoints(): Checkpoint[] {
    if (!fs.existsSync(this.checkpointsDir)) return [];
    return fs
      .readdirSync(this.checkpointsDir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => readJson<Checkpoint | null>(path.join(this.checkpointsDir, f), null))
      .filter((c): c is Checkpoint => !!c);
  }

  /** Human-readable memory dump */
  summary(): string {
    const idx = this.getIndex();
    const lessons = this.listLessons();
    const heuristics = this.listHeuristics();
    const outcomes = this.listOutcomes();
    const lines: string[] = [];
    lines.push(`memory root: ${this.root}`);
    lines.push(`stories:     ${idx.stories.length}`);
    lines.push(`plans:       ${fs.existsSync(this.plansDir) ? fs.readdirSync(this.plansDir).length : 0}`);
    lines.push(`outcomes:    ${outcomes.length} (${outcomes.filter((o) => o.success).length} ok)`);
    lines.push(`lessons:     ${lessons.length}`);
    lines.push(`heuristics:  ${heuristics.length}`);
    lines.push(`checkpoints: ${this.listCheckpoints().length}`);
    if (lessons.length) {
      lines.push('');
      lines.push('recent lessons:');
      for (const l of lessons.slice(0, 5)) {
        lines.push(`  [${l.category} w=${l.weight}] ${l.text}`);
      }
    }
    if (heuristics.length) {
      lines.push('');
      lines.push('heuristics (top by hits):');
      const top = [...heuristics].sort((a, b) => b.hits - a.hits).slice(0, 5);
      for (const h of top) {
        lines.push(`  [${h.hits} hits] /${h.pattern}/ → ${h.advice.slice(0, 72)}...`);
      }
    }
    return lines.join('\n');
  }
}
