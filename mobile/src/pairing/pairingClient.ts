import { encodeCtrl, parseCtrl, Hello, Welcome, ErrorMsg, CtrlMessage } from '@micshare/protocol';

export interface PairingResult {
  success: boolean;
  sessionId?: string;
  error?: string;
}

export class PairingClient {
  private ws: WebSocket | null = null;
  private url: string;

  constructor(ip: string, ctrlPort: number) {
    this.url = `ws://${ip}:${ctrlPort}`;
  }

  connect(token: string): Promise<PairingResult> {
    return new Promise((resolve) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (err) {
        resolve({ success: false, error: `WebSocket creation failed: ${err}` });
        return;
      }

      const timeout = setTimeout(() => {
        this.ws?.close();
        resolve({ success: false, error: 'Timeout de conexão (5s)' });
      }, 5000);

      this.ws.onopen = () => {
        const hello: Hello = {
          t: 'hello',
          v: 1,
          token,
          sampleRate: 48000,
          channels: 1,
          codec: 'pcm16',
          frameMs: 10,
        };
        this.ws!.send(encodeCtrl(hello));
      };

      this.ws.onmessage = (event) => {
        const { message, error } = parseCtrl(event.data);
        if (error || !message) return;

        switch (message.t) {
          case 'welcome': {
            clearTimeout(timeout);
            resolve({ success: true, sessionId: message.sessionId });
            break;
          }
          case 'error': {
            clearTimeout(timeout);
            const errMsg = message as ErrorMsg;
            resolve({ success: false, error: errMsg.message });
            this.ws?.close();
            break;
          }
        }
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        resolve({ success: false, error: 'Erro de conexão WebSocket' });
      };

      this.ws.onclose = () => {
        // Handled by message/error
      };
    });
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}