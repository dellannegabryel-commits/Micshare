// mDNS opcional (compatibilidade). Primário é beacon UDP broadcast.
// Implementado com bonjour-service quando disponível.
export interface DiscoveryConfig {
  serviceName: string; // ex: "DESKTOP-GABRY"
  instanceName: string;
  audioPort: number;
  ctrlPort: number;
  pairingCode: string;
  ttlMs?: number;
}

export class OptionalDiscovery {
  private available = false;

  constructor(private config: DiscoveryConfig) {}

  async start(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bonjour = require('bonjour-service');
      // bonjour-service anuncia mDNS; mantido como camada opcional.
      this.available = true;
      console.log('[discovery] mDNS disponível (opcional)');
    } catch {
      this.available = false;
      console.log('[discovery] mDNS indisponível; usando beacon UDP broadcast');
    }
  }

  isAvailable(): boolean {
    return this.available;
  }
}

// Beacon UDP broadcast sender (mecanismo primário de descoberta)
import { createSocket, type Socket } from 'node:dgram';
import { BEACON_PORT, CTRL_PORT, AUDIO_PORT } from '@micshare/protocol';

export interface BeaconConfig {
  name: string; // hostname do PC
  audioPort: number;
  ctrlPort: number;
  pairingCode: string;
}

export class BeaconSender {
  private socket: Socket | null = null;
  private interval: NodeJS.Timeout | null = null;
  private bound = false;

  constructor(private config: BeaconConfig) {}

  start(): void {
    if (this.bound) return;
    this.socket = createSocket('udp4');
    this.socket.on('error', (err) => console.error('[beacon] socket error:', err));
    this.socket.bind(() => {
      this.socket!.setBroadcast(true);
      this.bound = true;
      this.send();
      this.interval = setInterval(() => this.send(), 1000);
      console.log(`[beacon] broadcasting on 255.255.255.255:${BEACON_PORT} (${this.config.name})`);
    });
  }

  private send(): void {
    if (!this.socket) return;
    const msg = JSON.stringify({
      app: 'micshare',
      v: 1,
      name: this.config.name,
      audioPort: this.config.audioPort,
      ctrlPort: this.config.ctrlPort,
      pair: true,
      code: this.config.pairingCode,
    });
    const buf = Buffer.from(msg);
    try {
      this.socket.send(buf, 0, buf.length, BEACON_PORT, '255.255.255.255');
    } catch (e) {
      console.error('[beacon] send error:', e);
    }
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.bound = false;
  }
}
