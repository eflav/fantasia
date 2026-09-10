import type { Assumption } from '../types/index.js';

/**
 * Fill gaps in a vague user story with explicit, logged assumptions.
 * Never ask the user — invent reasonable defaults and document them.
 */
export function deriveAssumptions(story: string): Assumption[] {
  const s = story.toLowerCase();
  const out: Assumption[] = [];
  let n = 1;

  const add = (text: string, rationale: string) => {
    out.push({ id: `A${n++}`, text, rationale });
  };

  // Always-on defaults
  add(
    'Deliverable lives under ./workspace/ as files (no external services required).',
    'Fantasia must complete offline / without API keys by default.'
  );
  add(
    'Success means: artifacts exist, a verification report passes basic checks, and memory is updated.',
    'Self-managing runs need an observable done-state.'
  );
  add(
    'No clarifying questions will be asked; any ambiguity is resolved by these assumptions.',
    'Product rule: never stall on human input.'
  );

  // Domain guesses
  if (/todo|task|checklist|list/.test(s)) {
    add('Format: markdown checklist with 5–8 concrete items derived from the story.', 'Vague list stories map to checklists.');
    add('Items are marked done during the run to demonstrate completion.', 'Shows end-to-end progress.');
  } else if (/readme|document|docs|write.?up|spec/.test(s)) {
    add('Primary artifact: README.md (or SPEC.md) with Install / Run / Assumptions sections.', 'Standard doc skeleton.');
    add('Audience: a developer cloning the repo with no prior context.', 'Default reader persona.');
  } else if (/api|endpoint|http|rest|server/.test(s)) {
    add('Scaffold a single Node HTTP handler stub (no framework) plus a smoke script.', 'Minimal runnable surface.');
    add('No real network bind required for verify — syntax / dry-run is enough.', 'Keep demos hermetic.');
  } else if (/script|automate|cli|tool|command/.test(s)) {
    add('Primary artifact: an executable Node or shell script under workspace/.', 'Scripts are the natural unit.');
    add('Script supports --help and a dry-run / default invocation.', 'Verifiable without side effects.');
  } else if (/refactor|clean|improve|organize/.test(s)) {
    add('Produce before/after notes and an improved copy; do not delete originals.', 'Safe, additive refactor.');
  } else if (/test|qa|verify|check/.test(s)) {
    add('Write a test plan + a simple assertion script that exits 0 on pass.', 'Tests as artifacts.');
  } else {
    // Generic product / feature story
    add(
      'Interpret the story as a small software deliverable: plan → scaffold → implement stub → verify.',
      'Generic vague stories get the software-delivery pipeline.'
    );
    add(
      'Scope is a vertical slice that fits in one run (~minutes), not a multi-week project.',
      'Keep Fantasia demos completable.'
    );
    if (/user|login|auth|signup/.test(s)) {
      add('Auth is mocked with a local JSON user store; no real passwords or OAuth.', 'Avoid secrets and external IdPs.');
    }
    if (/ui|page|frontend|web|html/.test(s)) {
      add('UI is a single static HTML file with inline CSS; no bundler.', 'Minimal frontend default.');
    }
    if (/data|database|db|store/.test(s)) {
      add('Persistence is a JSON file under workspace/data/; no SQL server.', 'File-backed store.');
    }
  }

  add(
    'Language / stack: Node.js + plain files unless the story names another stack.',
    'Matches Fantasia host runtime.'
  );

  return out;
}

export function normalizeStory(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}
