// mDNS opcional (compatibilidade). Primário é beacon UDP broadcast.
// Implementado com bonjour-service quando disponível.
export interface DiscoveryConfig {
  serviceName: string; // ex: "DESKTOP-GABRY"
  instanceName: string;
  audioPort: number;
  ctrlPort: number;
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
import { networkInterfaces } from 'node:os';

export interface BeaconConfig {
  name: string; // hostname do PC
  audioPort: number;
  ctrlPort: number;
}

export class BeaconSender {
  private socket: Socket | null = null;
  private interval: NodeJS.Timeout | null = null;
  private bound = false;
  private broadcastAddresses: string[] = ['255.255.255.255'];

  constructor(private config: BeaconConfig) {
    this.discoverBroadcastAddresses();
  }

  private discoverBroadcastAddresses(): void {
    try {
      const interfaces = networkInterfaces();
      for (const [name, ifaces] of Object.entries(interfaces)) {
        if (!ifaces) continue;
        for (const iface of ifaces) {
          if (iface.family === 'IPv4' && !iface.internal && iface.netmask) {
            const ipParts = iface.address.split('.').map(Number);
            const maskParts = iface.netmask.split('.').map(Number);
            const broadcastParts = ipParts.map((octet, i) => octet | (~maskParts[i] & 0xff));
            const broadcastAddr = broadcastParts.join('.');
            if (!this.broadcastAddresses.includes(broadcastAddr)) {
              this.broadcastAddresses.push(broadcastAddr);
            }
          }
        }
      }
    } catch (e) {
      console.log('[beacon] could not discover subnet broadcasts:', (e as Error).message);
    }
  }

  start(): void {
    if (this.bound) return;
    this.socket = createSocket('udp4');
    this.socket.on('error', (err) => console.error('[beacon] socket error:', err));
    // Bind to 0.0.0.0 to send on all interfaces
    this.socket.bind({ port: BEACON_PORT, address: '0.0.0.0' }, () => {
      this.socket!.setBroadcast(true);
      this.bound = true;
      this.send();
      this.interval = setInterval(() => this.send(), 1000);
      const localAddr = this.socket!.address();
      console.log(`[beacon] bound to ${localAddr.address}:${localAddr.port}, broadcasting to ${this.broadcastAddresses.length} addresses on port ${BEACON_PORT}`);
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
      pair: false, // MVP: no pairing required
      code: '', // empty code for MVP (no pairing)
    });
    const buf = Buffer.from(msg);
    try {
      for (const addr of this.broadcastAddresses) {
        this.socket.send(buf, 0, buf.length, BEACON_PORT, addr);
      }
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