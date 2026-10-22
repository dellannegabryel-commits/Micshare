import { WebSocketServer, WebSocket } from 'ws';
import { encodeCtrl, parseCtrl, type CtrlMessage } from '@micshare/protocol';

export interface ControlConfig {
  port: number;
  pairingCode: string;
  onHello: (token: string, sessionId: string) => Promise<boolean>;
  onMute: (value: boolean) => void;
  onVolume: (value: number) => void;
  onBye: (sessionId: string) => void;
}

export class ControlServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, WebSocket>();
  private reconnects = 0;

  constructor(private config: ControlConfig) {}

  start(): void {
    this.wss = new WebSocketServer({ port: this.config.port });
    this.wss.on('connection', (ws) => {
      let sessionId: string | null = null;
      let authenticated = false;

      ws.on('message', (data) => {
        const text = data.toString();
        const { message, error } = parseCtrl(text);
        if (error || !message) {
          ws.send(encodeCtrl({ t: 'error', code: 'bad_message', message: error || 'invalid' }));
          return;
        }

        switch (message.t) {
          case 'hello': {
            const ok = this.config.onHello(message.token, crypto.randomUUID().slice(0, 8));
            ok.then((accepted) => {
              if (!accepted) {
                ws.send(encodeCtrl({ t: 'error', code: 'bad_token', message: 'código de pareamento inválido' }));
                ws.close();
                return;
              }
              authenticated = true;
              sessionId = crypto.randomUUID().slice(0, 8);
              this.sessions.set(sessionId, ws);
              ws.send(
                encodeCtrl({
                  t: 'welcome',
                  sessionId,
                  audioPort: 41235,
                  targetBufferMs: 30,
                })
              );
            });
            break;
          }
          case 'mute': {
            if (!authenticated) return;
            this.config.onMute(message.value);
            break;
          }
          case 'volume': {
            if (!authenticated) return;
            this.config.onVolume(Math.max(0, Math.min(4, message.value)));
            break;
          }
          case 'bye': {
            if (sessionId) {
              this.sessions.delete(sessionId);
              this.config.onBye(sessionId);
            }
            ws.close();
            break;
          }
          default:
            ws.send(encodeCtrl({ t: 'error', code: 'unknown', message: `tipo ${message.t} não tratado` }));
        }
      });

      ws.on('close', () => {
        if (sessionId) {
          this.sessions.delete(sessionId);
          this.reconnects += 1;
          this.config.onBye(sessionId);
        }
      });

      ws.on('error', () => {
        ws.close();
      });
    });
  }

  broadcastStats(stats: { lossPct: number; bufferMs: number; seqGaps: number; reconnects: number }): void {
    if (!this.wss) return;
    const msg = encodeCtrl({ t: 'stats', ...stats, reconnects: this.reconnects });
    for (const ws of this.sessions.values()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  stop(): void {
    this.wss?.close();
    this.sessions.clear();
  }
}
