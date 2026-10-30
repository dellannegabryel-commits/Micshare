// Canal administrativo local (Fase 2). No Windows usa named pipe
// \\.\pipe\micshare-pc-<USER>; em outros sistemas (ou se o pipe falhar) cai
// para TCP 127.0.0.1:41237. Protocolo: JSON Lines, token obrigatório.
import { createServer, type Server as NetServer, type Socket } from 'node:net';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';

export const ADMIN_TCP_PORT = 41237;

export interface AdminError {
  code: string;
  message: string;
}

export interface AdminResult {
  ok: boolean;
  data?: unknown;
  error?: AdminError;
  /** pede ao processo para encerrar depois de responder */
  stop?: boolean;
}

export type AdminHandler = (cmd: string, args: string[]) => Promise<AdminResult>;

export interface AdminServerOptions {
  onStop?: () => void;
  tcpPort?: number;
}

function localAppData(): string {
  return process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local');
}

export function adminDir(): string {
  return join(localAppData(), 'Micshare');
}

export function tokenPath(): string {
  return join(adminDir(), 'admin.token');
}

export function daemonInfoPath(): string {
  return join(adminDir(), 'daemon.json');
}

export function pipePath(): string {
  const user = process.env.USERNAME ?? userInfo().username ?? 'user';
  return `\\\\.\\pipe\\micshare-pc-${user.replace(/[^A-Za-z0-9_.-]/g, '_')}`;
}

/** Token existente ou null (não cria arquivo). */
export function readToken(): string | null {
  try {
    const token = readFileSync(tokenPath(), 'utf8').trim();
    return token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

/** Token de 32 bytes em %LOCALAPPDATA%\Micshare\admin.token (cria no primeiro boot). */
export function loadOrCreateToken(): string {
  const existing = readToken();
  if (existing) return existing;

  mkdirSync(adminDir(), { recursive: true });
  const token = randomBytes(32).toString('hex');
  writeFileSync(tokenPath(), token, { encoding: 'utf8' });
  return token;
}

interface ConnectionState {
  authed: boolean;
}

export class AdminServer {
  private server: NetServer | null = null;
  private sockets = new Set<Socket>();
  private token = '';
  private transport = '';
  private started = false;

  constructor(
    private handler: AdminHandler,
    private options: AdminServerOptions = {}
  ) {}

  getTransport(): string {
    return this.transport;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.token = loadOrCreateToken();

    if (process.platform === 'win32') {
      try {
        await this.listenPipe();
        this.started = true;
        console.log(`[admin] canal local: ${this.transport}`);
        return;
      } catch (err) {
        console.warn(`[admin] named pipe indisponível (${(err as Error).message}); usando TCP local`);
      }
    }

    await this.listenTcp();
    this.started = true;
    console.log(`[admin] canal local: ${this.transport}`);
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) {
      try {
        socket.destroy();
      } catch {
        // ignora
      }
    }
    this.sockets.clear();

    const server = this.server;
    this.server = null;
    this.started = false;
    if (!server) return;

    await new Promise<void>((resolve) => {
      try {
        server.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }

  // ------------------------------------------------------------------ listen

  private listenPipe(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const server = createServer((socket) => this.onConnection(socket));
      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        server.on('error', (err) => console.error('[admin] pipe error:', err.message));
        this.server = server;
        this.transport = pipePath();
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(pipePath());
    });
  }

  private listenTcp(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const port = this.options.tcpPort ?? ADMIN_TCP_PORT;
      const server = createServer((socket) => this.onConnection(socket));
      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        server.on('error', (err) => console.error('[admin] TCP error:', err.message));
        this.server = server;
        this.transport = `127.0.0.1:${port}`;
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen({ port, host: '127.0.0.1' });
    });
  }

  // ------------------------------------------------------------------ protocolo

  private onConnection(socket: Socket): void {
    this.sockets.add(socket);
    const state: ConnectionState = { authed: false };
    let buffer = '';

    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => this.sockets.delete(socket));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let index = buffer.indexOf('\n');
      while (index >= 0) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) void this.onLine(socket, line, state);
        index = buffer.indexOf('\n');
      }
    });
  }

  private async onLine(socket: Socket, line: string, state: ConnectionState): Promise<void> {
    let request: { id?: number | string; cmd?: string; args?: unknown; token?: string };
    try {
      request = JSON.parse(line);
    } catch {
      this.respond(socket, { id: null, ok: false, error: { code: 'bad_json', message: 'linha não é JSON válido' } });
      return;
    }

    const id = request.id ?? null;

    if (request.cmd === 'auth') {
      if (request.token !== this.token) {
        this.respond(socket, { id, ok: false, error: { code: 'unauthorized', message: 'token inválido' } });
        socket.end();
        return;
      }
      state.authed = true;
      this.respond(socket, { id, ok: true, data: { authed: true } });
      return;
    }

    if (!state.authed && request.token !== this.token) {
      this.respond(socket, { id, ok: false, error: { code: 'unauthorized', message: 'token inválido' } });
      socket.end();
      return;
    }
    state.authed = true;

    if (typeof request.cmd !== 'string' || request.cmd.length === 0) {
      this.respond(socket, { id, ok: false, error: { code: 'bad_request', message: 'campo "cmd" ausente' } });
      return;
    }

    const args = Array.isArray(request.args) ? request.args.map((a) => String(a)) : [];
    let result: AdminResult;
    try {
      result = await this.handler(request.cmd, args);
    } catch (err) {
      result = { ok: false, error: { code: 'error', message: (err as Error).message } };
    }

    this.respond(socket, { id, ...result });

    if (result.stop) {
      // deixa o frame sair antes de derrubar o processo
      setTimeout(() => this.options.onStop?.(), 50);
    }
  }

  private respond(socket: Socket, payload: unknown): void {
    try {
      socket.write(JSON.stringify(payload) + '\n');
    } catch {
      // conexão já fechada
    }
  }
}

/** true se o arquivo de token existe (indício de que o servidor já rodou). */
export function hasToken(): boolean {
  return existsSync(tokenPath());
}
