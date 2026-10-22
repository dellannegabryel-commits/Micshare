import { encodeCtrl, parseCtrl, Mute, Volume, Bye, Stats, ErrorMsg, CtrlMessage } from '@micshare/protocol';

export interface ControlCallbacks {
  onStats?: (stats: { lossPct: number; bufferMs: number; seqGaps: number; reconnects: number }) => void;
  onError?: (code: string, message: string) => void;
  onClose?: () => void;
}

export class ControlClient {
  private ws: WebSocket | null = null;
  private url: string = '';
  private callbacks: ControlCallbacks = {};
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 250;
  private maxReconnectDelay = 5000;
  private shouldReconnect = false;

  connect(ip: string, ctrlPort: number, callbacks: ControlCallbacks): Promise<void> {
    this.url = `ws://${ip}:${ctrlPort}`;
    this.callbacks = callbacks;
    this.shouldReconnect = true;
    return this.doConnect();
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        reject(err);
        return;
      }

      this.ws.onopen = () => {
        console.log('[control] connected');
        this.reconnectDelay = 250;
        resolve();
      };

      this.ws.onmessage = (event) => {
        const { message, error } = parseCtrl(event.data);
        if (error || !message) return;

        switch (message.t) {
          case 'stats': {
            const stats = message as Stats;
            this.callbacks.onStats?.({
              lossPct: stats.lossPct,
              bufferMs: stats.bufferMs,
              seqGaps: stats.seqGaps,
              reconnects: stats.reconnects,
            });
            break;
          }
          case 'error': {
            const err = message as ErrorMsg;
            this.callbacks.onError?.(err.code, err.message);
            break;
          }
        }
      };

      this.ws.onerror = (err) => {
        console.error('[control] error:', err);
      };

      this.ws.onclose = () => {
        console.log('[control] closed');
        this.callbacks.onClose?.();
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        console.log('[control] reconnecting...');
        this.doConnect().catch(() => this.scheduleReconnect());
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      }
    }, this.reconnectDelay);
  }

  sendMute(value: boolean): void {
    const msg: Mute = { t: 'mute', value };
    this.ws?.send(encodeCtrl(msg));
  }

  sendVolume(value: number): void {
    const msg: Volume = { t: 'volume', value: Math.max(0, Math.min(4, value)) };
    this.ws?.send(encodeCtrl(msg));
  }

  sendBye(): void {
    const msg: Bye = { t: 'bye' };
    this.ws?.send(encodeCtrl(msg));
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}

export const controlClient = new ControlClient();