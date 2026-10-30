import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { encodeCtrl, parseCtrl, type CtrlMessage, type Hello, type Welcome } from '@micshare/protocol';
import type { Codec, SessionInfo } from './serverState.js';
import { normalizeIp } from './serverState.js';

export interface ControlConfig {
  port: number;
  /** porta de áudio anunciada no welcome (precisa refletir --port) */
  audioPort: number;
  targetBufferMs?: number;
  /** quando definido, o hello precisa trazer o mesmo token */
  pairingCode?: string;
  requirePairing?: boolean;
  onHello: (session: SessionInfo) => void;
  onMute: (value: boolean) => void;
  onVolume: (value: number) => void;
  onBye: (sessionId: string) => void;
  onError?: (err: Error) => void;
}

interface SessionEntry {
  ws: WebSocket;
  info: SessionInfo;
}

export class ControlServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, SessionEntry>();
  private disconnects = 0;

  constructor(private config: ControlConfig) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.config.port, host: '0.0.0.0' });

    this.wss.on('error', (err: Error) => {
      console.error('[controle] WebSocket server error:', err.message);
      this.config.onError?.(err);
    });

    this.wss.on('connection', (ws, req) => {
      let sessionId: string | null = null;
      const ip = normalizeIp(req.socket.remoteAddress);

      ws.on('message', (data) => {
        try {
          const { message, error } = parseCtrl(data.toString());
          if (error || !message) {
            ws.send(encodeCtrl({ t: 'error', code: 'bad_message', message: error || 'invalid' }));
            return;
          }

          switch (message.t) {
            case 'hello':
              sessionId = this.handleHello(ws, message, ip);
              break;

            case 'mute':
              if (!sessionId) return;
              try {
                this.config.onMute(message.value);
              } catch (err) {
                console.error('[controle] Error in onMute:', (err as Error).message);
              }
              break;

            case 'volume':
              if (!sessionId) return;
              try {
                this.config.onVolume(Math.max(0, Math.min(4, message.value)));
              } catch (err) {
                console.error('[controle] Error in onVolume:', (err as Error).message);
              }
              break;

            case 'bye':
              // o handler de close remove a sessão e notifica uma única vez
              ws.close(1000, 'bye');
              break;

            default:
              ws.send(encodeCtrl({ t: 'error', code: 'unknown', message: `tipo ${message.t} não tratado` }));
          }
        } catch (err) {
          console.error('[controle] Error processing message:', (err as Error).message);
        }
      });

      ws.on('close', () => {
        if (!sessionId) return;
        if (this.sessions.delete(sessionId)) {
          this.disconnects += 1;
          this.config.onBye(sessionId);
        }
      });

      ws.on('error', (err: Error) => {
        console.error('[controle] WebSocket error:', err.message);
        ws.close();
      });
    });

    this.wss.on('listening', () => {
      console.log(`[controle] WebSocket server listening on port ${this.config.port} (0.0.0.0)`);
    });
  }

  listSessions(): SessionInfo[] {
    return [...this.sessions.values()].map((s) => ({ ...s.info }));
  }

  /** Liga/desliga a exigência de pareamento em runtime. */
  setPairing(enabled: boolean, code: string): void {
    this.config.requirePairing = enabled;
    this.config.pairingCode = code;
  }

  isPairingEnabled(): boolean {
    return this.config.requirePairing === true;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  /** Encerra uma sessão (ou todas) enviando `bye`. Devolve quantas foram fechadas. */
  disconnect(target: string = 'all'): number {
    const ids = target === 'all' ? [...this.sessions.keys()] : [target];
    let closed = 0;
    for (const id of ids) {
      const entry = this.sessions.get(id);
      if (!entry) continue;
      try {
        if (entry.ws.readyState === WebSocket.OPEN) {
          entry.ws.send(encodeCtrl({ t: 'bye' }));
        }
      } catch {
        // segue para o close de qualquer forma
      }
      try {
        entry.ws.close(1000, 'disconnected by server');
      } catch {
        this.sessions.delete(id);
        this.config.onBye(id);
      }
      closed += 1;
    }
    return closed;
  }

  broadcastStats(stats: { lossPct: number; bufferMs: number; seqGaps: number }): void {
    if (!this.wss || this.sessions.size === 0) return;
    const msg = encodeCtrl({
      t: 'stats',
      lossPct: stats.lossPct,
      bufferMs: stats.bufferMs,
      seqGaps: stats.seqGaps,
      reconnects: this.disconnects,
    });
    const now = Date.now();
    for (const entry of this.sessions.values()) {
      entry.info.lastStatsAt = now;
      if (entry.ws.readyState === WebSocket.OPEN) entry.ws.send(msg);
    }
  }

  async stop(): Promise<void> {
    for (const entry of this.sessions.values()) {
      try {
        entry.ws.terminate();
      } catch {
        // ignora
      }
    }
    this.sessions.clear();

    const wss = this.wss;
    this.wss = null;
    if (!wss) return;
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
      // wss.close() não fecha conexões vivas; já terminamos acima
    });
  }

  private handleHello(ws: WebSocket, message: Hello, ip: string): string | null {
    if (this.config.requirePairing) {
      const expected = this.config.pairingCode ?? '';
      if (!expected || message.token !== expected) {
        ws.send(encodeCtrl({ t: 'error', code: 'unauthorized', message: 'código de pareamento inválido' }));
        ws.close(1008, 'unauthorized');
        return null;
      }
    }

    const sessionId = randomUUID().slice(0, 8);
    const requested = message.codec === 'opus' ? 'opus' : 'pcm';
    const supported = (message as Hello & { supportedCodecs?: string[] }).supportedCodecs ?? ['pcm', 'opus'];
    const codec: Codec = supported.includes(requested) ? requested : 'pcm';

    const info: SessionInfo = { id: sessionId, ip, codec, connectedAt: Date.now(), lastStatsAt: null };
    this.sessions.set(sessionId, { ws, info });

    try {
      this.config.onHello(info);
    } catch (err) {
      console.error('[controle] Error in hello handler:', (err as Error).message);
      ws.close();
      return null;
    }

    const welcome: Welcome & { codec: Codec } = {
      t: 'welcome',
      sessionId,
      audioPort: this.config.audioPort,
      targetBufferMs: this.config.targetBufferMs ?? 30,
      codec,
    };
    ws.send(encodeCtrl(welcome as CtrlMessage));
    console.log(`[controle] sessão ${sessionId} (${ip}) codec=${codec}`);
    return sessionId;
  }
}
