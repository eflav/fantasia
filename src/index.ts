#!/usr/bin/env node
/**
 * Fantasia — self-managing workflow tool
 * $ fantasia  |  npm start  |  make run
 */
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { MemoryStore } from './memory/store.js';
import { FantasiaEngine } from './engine/runner.js';
import { startRepl } from './cli/repl.js';
import { handleCommand, SAMPLES } from './cli/commands.js';
import { BANNER } from './cli/banner.js';
import { startWebServer } from './web/server.js';
import type { EngineConfig } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Project root: prefer cwd if it looks like fantasia, else package root */
function resolveRoot(): string {
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
      if (pkg.name === 'fantasia') return cwd;
    } catch {
      /* fall through */
    }
  }
  // src/ -> project root
  return path.resolve(__dirname, '..');
}

async function main(): Promise<void> {
  const rootDir = resolveRoot();
  const args = process.argv.slice(2);
  const wantWeb = args.includes('--web');
  const wantDemo = args.includes('--demo');
  const storyArg = args.find((a) => a.startsWith('--story='));
  const preferClaude = !args.includes('--local');

  const config: EngineConfig = {
    rootDir,
    memoryDir: path.join(rootDir, '.fantasia'),
    workspaceDir: path.join(rootDir, 'workspace'),
    maxRetries: 2,
    useClaude: preferClaude,
    claudeAvailable: false,
  };

  fs.mkdirSync(config.workspaceDir, { recursive: true });
  const memory = new MemoryStore(config.memoryDir);
  const engine = new FantasiaEngine(config, memory);
  await engine.init();

  const log = (line: string) => process.stdout.write(line + '\n');

  if (wantWeb) {
    const publicDir = path.join(rootDir, 'public');
    console.log(BANNER);
    console.log(`backend: ${engine.getBackend()}`);
    startWebServer(engine, publicDir, Number(process.env.PORT) || 3920);
    return;
  }

  if (wantDemo) {
    console.log(BANNER);
    console.log(`backend: ${engine.getBackend()}`);
    for (const sample of SAMPLES) {
      log('');
      log(`══ demo ${sample.id}: ${sample.title} ══`);
      log(sample.story);
      await engine.runStory(sample.story, log);
    }
    return;
  }

  if (storyArg) {
    const story = storyArg.slice('--story='.length);
    console.log(BANNER);
    console.log(`backend: ${engine.getBackend()}`);
    await engine.runStory(story, log);
    return;
  }

  // Non-interactive single command from argv remainder
  const positional = args.filter((a) => !a.startsWith('--'));
  if (positional.length) {
    console.log(BANNER);
    console.log(`backend: ${engine.getBackend()}`);
    await handleCommand(positional.join(' '), engine, log);
    return;
  }

  // Interactive REPL
  await startRepl(engine);
}

main().catch((err) => {
  console.error('fantasia fatal:', err);
  process.exit(1);
});
