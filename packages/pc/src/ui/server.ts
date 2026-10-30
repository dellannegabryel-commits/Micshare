// Servidor web local (somente 127.0.0.1) para controlar o Micshare PC via
// canal administrativo. Serve a UI estática embutida/built e expõe /api/*.
import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import * as client from './client.js';

export interface UiServerOptions {
  port?: number;
  host?: string;
}

const DEFAULT_PORT = 41238;

function findWebDir(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  // em dev (src) ou build (dist)
  const candidates = [
    resolve(here, 'web', 'dist'),
    resolve(here, '..', 'ui', 'web', 'dist'),
    resolve(here, 'dist'),
    resolve(process.cwd(), 'packages', 'pc', 'dist', 'ui', 'web', 'dist'),
    resolve(process.cwd(), 'dist', 'ui', 'web', 'dist'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'index.html'))) return c;
  }
  return null;
}

function findFallbackHtml(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, 'web', 'index.html'),
    resolve(here, '..', 'ui', 'web', 'index.html'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return dirname(c);
  }
  return null;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<{ port: number; host: string; url: string }> {
  const app = express();
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? DEFAULT_PORT;

  app.use(cors({ origin: `http://${host}:${port}`, credentials: false }));
  app.use(express.json());

  // API
  app.get('/api/health', async (_req, res) => {
    try {
      res.json(await client.health());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/status', async (_req, res) => {
    try {
      const status = await client.getStatus();
      if (!status) return res.status(503).json({ error: 'servidor não está rodando' });
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/sessions', async (_req, res) => {
    try {
      res.json(await client.getSessions());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.get('/api/devices', async (_req, res) => {
    try {
      res.json(await client.getDevices());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/cmd', async (req, res) => {
    const cmd = typeof req.body?.cmd === 'string' ? req.body.cmd : '';
    const args = Array.isArray(req.body?.args) ? req.body.args.map((a: unknown) => String(a)) : [];
    if (!cmd) return res.status(400).json({ error: 'campo "cmd" obrigatório' });
    try {
      const result = await client.sendCommand(cmd, args);
      if (!result.ok) return res.status(result.error?.code === 'not_running' ? 503 : 400).json(result);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/daemon/start', async (req, res) => {
    try {
      const args = Array.isArray(req.body?.args) ? req.body.args.map((a: unknown) => String(a)) : [];
      res.json(await client.startDaemon(args));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/daemon/stop', async (_req, res) => {
    try {
      res.json(await client.stopDaemon());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // UI estática
  const webDir = findWebDir();
  if (webDir) {
    app.use(express.static(webDir));
    app.get('*', (_req, res) => res.sendFile(join(webDir, 'index.html')));
    console.log(`[ui] servindo UI de ${webDir}`);
  } else {
    const fallback = findFallbackHtml();
    if (fallback) {
      app.use(express.static(fallback));
      app.get('*', (_req, res) => res.sendFile(join(fallback, 'index.html')));
      console.log(`[ui] servindo UI dev de ${fallback}`);
    } else {
      app.get('*', (_req, res) => {
        res.type('html').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Micshare PC UI</title>
<style>body{font-family:system-ui;margin:40px;background:#0b1020;color:#e6edf3}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:520px}
a{color:#58a6ff}</style></head>
<body><div class="card">
<h1>Micshare PC UI</h1>
<p>Frontend ainda não compilado. Rode <code>npm --prefix packages/pc run build:ui</code> ou abra em modo dev.</p>
<p>API disponível em <code>/api/health</code>, <code>/api/status</code>, <code>/api/cmd</code>.</p>
</div></body></html>`);
      });
      console.log('[ui] UI não encontrada; servindo página de fallback com API');
    }
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const url = `http://${host}:${actualPort}`;
      console.log(`[ui] Micshare PC UI em ${url}`);
      resolve({ port: actualPort, host, url });
    });
    server.on('error', reject);
  });
}
