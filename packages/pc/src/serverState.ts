// Tipos de estado do servidor PC. Fonte única consumida pela CLI, pelo modo
// --json e (no futuro) pelo pc-ui em Rust.
import { networkInterfaces } from 'node:os';
import type { MetricsSnapshot } from './metrics.js';

export const VERSION = '0.1.0';

export type Codec = 'pcm' | 'opus';

export interface SessionInfo {
  id: string;
  ip: string;
  codec: Codec;
  connectedAt: number; // epoch ms
  lastStatsAt: number | null;
}

export interface DeviceInfo {
  id: number;
  name: string;
  channels: number;
}

export interface ServerStatus {
  version: string;
  pid: number;
  startedAt: number;
  uptimeMs: number;
  running: boolean;
  ports: { audio: number; control: number; beacon: number };
  addresses: string[];
  device: (DeviceInfo & { requested: string | null }) | null;
  codec: Codec;
  mute: boolean;
  volume: number;
  beacon: { running: boolean; intervalMs: number; pairingEnabled: boolean };
  sessions: SessionInfo[];
  metrics: MetricsSnapshot;
}

/** IPv4 não-internos da máquina (o que o celular pode usar para conectar). */
export function localAddresses(): string[] {
  const out: string[] = [];
  try {
    for (const ifaces of Object.values(networkInterfaces())) {
      for (const iface of ifaces ?? []) {
        if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
      }
    }
  } catch {
    // sem rede: devolve vazio
  }
  return out;
}

/** Normaliza o endereço que vem do WebSocket (::ffff:192.168.0.2 → 192.168.0.2). */
export function normalizeIp(remote: string | undefined): string {
  if (!remote) return 'desconhecido';
  return remote.startsWith('::ffff:') ? remote.slice(7) : remote;
}

/** 3725000 → "01:02:05" */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** 65000 → "1m 5s" (para listas de sessões) */
export function formatShortDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
