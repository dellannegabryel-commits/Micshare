// Tipos espelhados de packages/pc/src/serverState.ts e metrics.ts.
// O daemon devolve esses shapes via canal administrativo (JSON).

export type Codec = "pcm" | "opus";

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

export interface MetricsSnapshot {
  received: number;
  lost: number;
  lossPct: number;
  gaps: number;
  underruns: number;
  fastForwards: number;
  flushes: number;
  bufferMs: number;
  fps: number;
  fpsAvg: number;
  lossPctAvg: number;
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

export interface PairingInfo {
  enabled: boolean;
  code: string | null;
}
