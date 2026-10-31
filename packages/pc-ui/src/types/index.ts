export interface ServerConfig {
  audioPort: number;
  ctrlPort: number;
  deviceSubstring: string | null;
  name: string | null;
  defaultCodec: 'pcm' | 'opus';
}

export interface ServerStats {
  running: boolean;
  sessions: number;
  jitter: JitterMetrics;
  fps: number;
  lossPct: number;
  deviceName: string;
}

export interface JitterMetrics {
  received: number;
  lost: number;
  gaps: number;
  bufferMs: number;
  underruns: number;
  fastForwards: number;
  flushes: number;
}

export interface AudioDevice {
  name: string;
  isDefault: boolean;
}

export interface LogEntry {
  id: number;
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface DiscoveryStatus {
  sent: number;
  probesAnswered: number;
  enabled: boolean;
}