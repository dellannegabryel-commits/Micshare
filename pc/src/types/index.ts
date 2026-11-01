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
  muted: boolean;
  /** Volume fixed-point do backend: 1000 = 100%, 4000 = 400%. */
  volume: number;
  /** Reconexões (novos `hello` de IPs que já se conectaram). */
  reconnects: number;
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
  /**
   * `true` se o dispositivo é um cabo virtual de áudio (VB-Cable, VoiceMeeter).
   * É nele que o áudio deve ser direcionado para ser capturado como
   * microfone pelo Discord/OBS/Zoom.
   */
  isVirtualCable: boolean;
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

export interface CommandError {
  code: string;
  message: string;
}

export interface StatusEvent {
  running: boolean;
  error: CommandError | null;
}