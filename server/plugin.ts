// Mounts the intent route on the Vite dev and preview servers, so
// `npm run dev` starts the whole prototype with one command.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { classify, hasKey, MODEL } from './intent';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10_000) reject(new Error('too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, json: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(json));
}

type Next = (err?: unknown) => void;

async function handle(req: IncomingMessage, res: ServerResponse, next: Next) {
  const url = req.url?.split('?')[0];
  if (url === '/api/health' && req.method === 'GET') return send(res, 200, { genai: hasKey(), model: MODEL });
  if (url !== '/api/intent') return next();
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' });
  try {
    const raw = await readBody(req);
    const { status, json } = await classify(JSON.parse(raw || '{}'));
    send(res, status, json);
  } catch {
    send(res, 400, { error: 'bad_request' });
  }
}

export function intentApiPlugin(): Plugin {
  return {
    name: 'packpal-intent-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => void handle(req, res, next));
    },
  };
}
