import { WebSocketServer, WebSocket } from 'ws';
import { encodeCtrl, parseCtrl, type CtrlMessage, type Hello, type Welcome, type ErrorMsg } from '@micshare/protocol';

export interface ControlConfig {
  port: number;
  onMute: (value: boolean) => void;
  onVolume: (value: number) => void;
  onBye: (sessionId: string) => void;
  onHello?: (sessionId: string, codec: string) => void;
  defaultCodec?: 'pcm' | 'opus';
}

export class ControlServer {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, WebSocket>();
  private reconnects = 0;

  constructor(private config: ControlConfig) {}

  start(): void {
    this.wss = new WebSocketServer({
      port: this.config.port,
      host: '0.0.0.0',
    });

    this.wss.on('error', (err: Error) => {
      console.error('[controle] WebSocket server error:', err.message);
    });

    this.wss.on('connection', (ws) => {
      let sessionId: string | null = null;
      let authenticated = false;

      ws.on('message', (data) => {
        try {
          const text = data.toString();
          const { message, error } = parseCtrl(text);
          if (error || !message) {
            ws.send(encodeCtrl({ t: 'error', code: 'bad_message', message: error || 'invalid' }));
            return;
          }

          switch (message.t) {
            case 'hello': {
              try {
                authenticated = true;
                sessionId = crypto.randomUUID().slice(0, 8);
                this.sessions.set(sessionId, ws);

                // Negotiate codec
                const requestedCodec = message.codec === 'opus' ? 'opus' : 'pcm';
                const supported = message.supportedCodecs || ['pcm'];
                const negotiatedCodec = supported.includes(requestedCodec) ? requestedCodec : 'pcm';

                if (this.config.onHello) {
                  this.config.onHello(sessionId, negotiatedCodec);
                }
                ws.send(
                  encodeCtrl({
                    t: 'welcome',
                    sessionId,
                    audioPort: 41235,
                    targetBufferMs: 30,
                    codec: negotiatedCodec,
                  })
                );
                console.log(`[controle] Codec negotiated: ${negotiatedCodec} (requested: ${requestedCodec})`);
              } catch (err) {
                console.error('[controle] Error in hello handler:', (err as Error).message);
                ws.close();
              }
              break;
            }
            case 'mute': {
              if (!authenticated) return;
              try {
                this.config.onMute(message.value);
              } catch (err) {
                console.error('[controle] Error in onMute:', (err as Error).message);
              }
              break;
            }
            case 'volume': {
              if (!authenticated) return;
              try {
                this.config.onVolume(Math.max(0, Math.min(4, message.value)));
              } catch (err) {
                console.error('[controle] Error in onVolume:', (err as Error).message);
              }
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
        } catch (err) {
          console.error('[controle] Error processing message:', (err as Error).message);
        }
      });

      ws.on('close', () => {
        if (sessionId) {
          this.sessions.delete(sessionId);
          this.reconnects += 1;
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

  broadcastStats(stats: { lossPct: number; bufferMs: number; seqGaps: number; reconnects: number }): void {
    if (!this.wss) return;
    try {
      const msg = encodeCtrl({ t: 'stats', ...stats, reconnects: this.reconnects });
      for (const ws of this.sessions.values()) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    } catch (err) {
      console.error('[controle] Error broadcasting stats:', (err as Error).message);
    }
  }

  stop(): void {
    try {
      this.wss?.close();
    } catch (err) {
      console.error('[controle] Error stopping server:', (err as Error).message);
    }
    this.sessions.clear();
  }
}