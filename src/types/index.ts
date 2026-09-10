/** Core types for Fantasia */

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

export interface Assumption {
  id: string;
  text: string;
  rationale: string;
}

export interface PlanStep {
  id: string;
  title: string;
  action: string;
  kind: 'analyze' | 'create' | 'modify' | 'verify' | 'shell' | 'reflect';
  status: StepStatus;
  artifact?: string;
  output?: string;
  error?: string;
  retries: number;
}

export interface Plan {
  id: string;
  storyId: string;
  title: string;
  assumptions: Assumption[];
  steps: PlanStep[];
  influencedBy: string[]; // lesson / heuristic ids that shaped this plan
  createdAt: string;
}

export interface RunOutcome {
  planId: string;
  storyId: string;
  success: boolean;
  startedAt: string;
  finishedAt: string;
  artifacts: string[];
  summary: string;
  failedSteps: string[];
}

export interface Lesson {
  id: string;
  storyId: string;
  planId: string;
  text: string;
  category: 'planning' | 'execution' | 'verification' | 'general';
  weight: number; // how strongly to apply next time
  createdAt: string;
}

export interface Heuristic {
  id: string;
  pattern: string; // keyword / regex-ish hint
  advice: string;
  hits: number;
  createdAt: string;
  updatedAt: string;
}

export interface StoryRecord {
  id: string;
  raw: string;
  normalized: string;
  createdAt: string;
  planIds: string[];
  outcomeIds: string[];
}

export interface Checkpoint {
  planId: string;
  storyId: string;
  stepIndex: number;
  plan: Plan;
  updatedAt: string;
}

export interface MemoryIndex {
  stories: string[];
  lessons: string[];
  heuristics: string[];
  outcomes: string[];
  version: number;
}

export interface EngineConfig {
  rootDir: string;
  memoryDir: string;
  workspaceDir: string;
  maxRetries: number;
  useClaude: boolean;
  claudeAvailable: boolean;
}

export type LogFn = (line: string) => void;
