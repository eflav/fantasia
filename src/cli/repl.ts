import * as readline from 'readline';
import type { FantasiaEngine } from '../engine/runner.js';
import { BANNER, prompt } from './banner.js';
import { handleCommand } from './commands.js';

export async function startRepl(engine: FantasiaEngine): Promise<void> {
  const log = (line: string) => {
    process.stdout.write(line + '\n');
  };

  log(BANNER);
  await engine.init();
  log(`backend: ${engine.getBackend()}`);
  log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: prompt(),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    rl.pause();
    try {
      const result = await handleCommand(line, engine, log);
      if (result === 'quit') {
        rl.close();
        return;
      }
    } catch (err) {
      log(`error: ${err instanceof Error ? err.message : String(err)}`);
    }
    rl.resume();
    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
