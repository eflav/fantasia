import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import type { FantasiaEngine } from '../engine/runner.js';
import { handleCommand } from '../cli/commands.js';
import { BANNER } from '../cli/banner.js';

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function parseUrl(raw: string): { pathname: string; searchParams: URLSearchParams } {
  const u = new URL(raw, 'http://fantasia.local');
  return { pathname: u.pathname, searchParams: u.searchParams };
}

function checkToken(req: http.IncomingMessage, searchParams: URLSearchParams): boolean {
  const expected = process.env.FANTASIA_TOKEN?.trim();
  if (!expected) return true; // open if unset
  const auth = req.headers.authorization || '';
  if (auth === `Bearer ${expected}`) return true;
  if (searchParams.get('token') === expected) return true;
  return false;
}

/**
 * Tiny vanilla web terminal hitting the same engine.
 * Binds 0.0.0.0 so tunnels / phones / hosts can reach it.
 */
export function startWebServer(
  engine: FantasiaEngine,
  publicDir: string,
  port = 3920,
  host = '0.0.0.0'
): http.Server {
  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const { pathname, searchParams } = parseUrl(rawUrl);

    if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method === 'GET' && pathname === '/api/banner') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          banner: stripAnsi(BANNER),
          backend: engine.getBackend(),
          tokenRequired: Boolean(process.env.FANTASIA_TOKEN?.trim()),
        })
      );
      return;
    }

    if (req.method === 'POST' && pathname === '/api/exec') {
      if (!checkToken(req, searchParams)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
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
      const log = (l: string) => lines.push(stripAnsi(l));
      try {
        await engine.init();
        const result = await handleCommand(line, engine, log);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ lines, quit: result === 'quit' }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: err instanceof Error ? err.message : String(err),
            lines,
          })
        );
      }
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  server.listen(port, host, () => {
    console.log(`fantasia web terminal listening on http://${host}:${port}`);
    console.log(`  local:  http://127.0.0.1:${port}`);
    if (process.env.FANTASIA_TOKEN?.trim()) {
      console.log('  auth:   FANTASIA_TOKEN required for /api/exec');
    } else {
      console.log('  auth:   open (set FANTASIA_TOKEN to require Bearer/?token=)');
    }
  });
  return server;
}
