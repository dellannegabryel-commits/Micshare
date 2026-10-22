import { createSocket } from 'react-native-udp';
import { BeaconMessage, PCInfo } from './types';

const BEACON_PORT = 41234;
const TTL_MS = 3000;

export function parseBeacon(data: Uint8Array): BeaconMessage | null {
  try {
    const text = new TextDecoder().decode(data);
    const msg = JSON.parse(text) as BeaconMessage;
    if (msg.app !== 'micshare' || msg.v !== 1) return null;
    if (typeof msg.name !== 'string' || typeof msg.ip !== 'string') return null;
    if (typeof msg.audioPort !== 'number' || typeof msg.ctrlPort !== 'number') return null;
    if (typeof msg.pair !== 'boolean' || typeof msg.code !== 'string') return null;
    return msg;
  } catch {
    return null;
  }
}

export class BeaconListener {
  private socket: ReturnType<typeof createSocket> | null = null;
  private pcs = new Map<string, PCInfo>();
  private listeners: Set<(pcs: PCInfo[]) => void> = new Set();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4');
      
      this.socket.on('error', (err) => {
        console.error('[beacon] socket error:', err);
        reject(err);
      });

      this.socket.on('listening', () => {
        console.log('[beacon] listening on', BEACON_PORT);
        resolve();
      });

      this.socket.on('message', (msg, rinfo) => {
        const beacon = parseBeacon(msg);
        if (!beacon) return;
        const key = `${beacon.name}@${rinfo.address}`;
        this.pcs.set(key, {
          name: beacon.name,
          ip: rinfo.address,
          audioPort: beacon.audioPort,
          ctrlPort: beacon.ctrlPort,
          pair: beacon.pair,
          code: beacon.code,
          lastSeen: Date.now(),
        });
        this.notify();
      });

      this.socket.bind(BEACON_PORT);

      // Cleanup stale entries every second
      this.cleanupInterval = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [key, pc] of this.pcs) {
          if (now - pc.lastSeen > TTL_MS) {
            this.pcs.delete(key);
            changed = true;
          }
        }
        if (changed) this.notify();
      }, 1000);
    });
  }

  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.socket?.close();
    this.socket = null;
    this.pcs.clear();
  }

  getPCs(): PCInfo[] {
    return Array.from(this.pcs.values()).sort((a, b) => b.lastSeen - a.lastSeen);
  }

  subscribe(listener: (pcs: PCInfo[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getPCs());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const pcs = this.getPCs();
    for (const l of this.listeners) l(pcs);
  }
}

export const beaconListener = new BeaconListener();