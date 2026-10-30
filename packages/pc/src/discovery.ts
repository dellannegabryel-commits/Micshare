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
import { BEACON_PORT } from '@micshare/protocol';
import { networkInterfaces } from 'node:os';

export interface BeaconConfig {
  name: string; // hostname do PC
  audioPort: number;
  ctrlPort: number;
  beaconPort?: number;
  intervalMs?: number;
  pairingEnabled?: boolean;
  pairingCode?: string;
}

export class BeaconSender {
  private socket: Socket | null = null;
  private interval: NodeJS.Timeout | null = null;
  private bound = false;
  private broadcastAddresses: string[] = ['255.255.255.255'];
  private intervalMs: number;
  private beaconPort: number;
  private pairingEnabled: boolean;
  private pairingCode: string;

  constructor(private config: BeaconConfig) {
    this.intervalMs = config.intervalMs ?? 1000;
    this.beaconPort = config.beaconPort ?? BEACON_PORT;
    this.pairingEnabled = config.pairingEnabled ?? false;
    this.pairingCode = config.pairingCode ?? '';
    this.discoverBroadcastAddresses();
  }

  private discoverBroadcastAddresses(): void {
    try {
      const interfaces = networkInterfaces();
      for (const ifaces of Object.values(interfaces)) {
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
    this.socket.on('error', (err) => console.error('[beacon] socket error:', err.message));
    this.socket.bind({ port: this.beaconPort, address: '0.0.0.0' }, () => {
      if (!this.socket) return;
      this.socket.setBroadcast(true);
      this.bound = true;
      this.send();
      this.restartTimer();
      const localAddr = this.socket.address();
      console.log(
        `[beacon] bound to ${localAddr.address}:${localAddr.port}, broadcasting to ${this.broadcastAddresses.length} addresses on port ${this.beaconPort}`
      );
    });
  }

  /** Liga/desliga o beacon sem recriar o socket. */
  setEnabled(enabled: boolean): void {
    if (enabled && !this.interval) {
      this.restartTimer();
      this.send();
    } else if (!enabled && this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  setIntervalMs(ms: number): void {
    this.intervalMs = Math.max(100, Math.round(ms));
    if (this.interval) this.restartTimer();
  }

  setPairing(enabled: boolean, code: string): void {
    this.pairingEnabled = enabled;
    this.pairingCode = code;
    this.send();
  }

  isRunning(): boolean {
    return this.bound && this.interval !== null;
  }

  getIntervalMs(): number {
    return this.intervalMs;
  }

  getBeaconPort(): number {
    return this.beaconPort;
  }

  isPairingEnabled(): boolean {
    return this.pairingEnabled;
  }

  private restartTimer(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.send(), this.intervalMs);
  }

  private send(): void {
    if (!this.socket || !this.bound) return;
    const msg = JSON.stringify({
      app: 'micshare',
      v: 1,
      name: this.config.name,
      audioPort: this.config.audioPort,
      ctrlPort: this.config.ctrlPort,
      pair: this.pairingEnabled,
      code: this.pairingEnabled ? this.pairingCode : '',
    });
    const buf = Buffer.from(msg);
    try {
      for (const addr of this.broadcastAddresses) {
        this.socket.send(buf, 0, buf.length, this.beaconPort, addr);
      }
    } catch (e) {
      console.error('[beacon] send error:', (e as Error).message);
    }
  }

  async stop(): Promise<void> {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.bound = false;
    if (!socket) return;
    await new Promise<void>((resolve) => {
      try {
        socket.close(() => resolve());
      } catch {
        resolve();
      }
    });
  }
}
