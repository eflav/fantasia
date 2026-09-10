import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { FantasiaEngine } from '../engine/runner.js';
import { handleCommand } from '../cli/commands.js';
import { BANNER } from '../cli/banner.js';

/**
 * Tiny vanilla web terminal hitting the same engine.
 */
export function startWebServer(engine: FantasiaEngine, publicDir: string, port = 3920): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = req.url || '/';

    if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
      const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && url === '/api/banner') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ banner: BANNER.replace(/\x1b\[[0-9;]*m/g, ''), backend: engine.getBackend() }));
      return;
    }

    if (req.method === 'POST' && url === '/api/exec') {
      let body = '';
      for await (const chunk of req) body += chunk;
      let line = '';
      try {
        line = JSON.parse(body).line || '';
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'bad json' }));
        return;
      }
      const lines: string[] = [];
      const log = (l: string) => lines.push(l.replace(/\x1b\[[0-9;]*m/g, ''));
      try {
        await engine.init();
        const result = await handleCommand(line, engine, log);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ lines, quit: result === 'quit' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err), lines }));
      }
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(port, () => {
    console.log(`fantasia web terminal on http://127.0.0.1:${port}`);
  });
  return server;
}
