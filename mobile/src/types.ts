export interface PCInfo {
  name: string;
  ip: string;
  audioPort: number;
  ctrlPort: number;
  pair: boolean;
  code: string;
  lastSeen: number;
}

export interface BeaconMessage {
  app: string;
  v: number;
  name: string;
  audioPort: number;
  ctrlPort: number;
  pair: boolean;
  code: string;
}

export interface SessionInfo {
  sessionId: string;
  ip: string;
  audioPort: number;
  ctrlPort: number;
}

export interface StatsData {
  lossPct: number;
  bufferMs: number;
  seqGaps: number;
  reconnects: number;
}