export interface Hello {
  t: 'hello';
  v: number;            // protocol version
  token: string;        // 6-digit pairing code
  sampleRate: number;
  channels: number;
  codec: 'pcm16' | 'opus';
  frameMs: number;
}

export interface Welcome {
  t: 'welcome';
  sessionId: string;
  audioPort: number;
  targetBufferMs: number;
}

export interface Mute {
  t: 'mute';
  value: boolean;
}

export interface Volume {
  t: 'volume';
  value: number; // 0..4 multiplier
}

export interface Bye {
  t: 'bye';
}

export interface Stats {
  t: 'stats';
  lossPct: number;
  bufferMs: number;
  seqGaps: number;
  reconnects: number;
}

export interface ErrorMsg {
  t: 'error';
  code: string;
  message: string;
}

export type CtrlMessage = Hello | Welcome | Mute | Volume | Bye | Stats | ErrorMsg;

export interface ParseResult {
  message: CtrlMessage | null;
  error: string | null;
}

export function parseCtrl(text: string): ParseResult {
  if (Buffer.byteLength(text) > 1024) {
    return { message: null, error: 'message too large' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { message: null, error: 'invalid json' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { message: null, error: 'not an object' };
  }
  const obj = parsed as Record<string, unknown>;
  const t = obj.t;
  if (typeof t !== 'string') {
    return { message: null, error: 'missing t field' };
  }

  switch (t) {
    case 'hello': {
      if (
        typeof obj.v !== 'number' ||
        typeof obj.token !== 'string' ||
        typeof obj.sampleRate !== 'number' ||
        typeof obj.channels !== 'number' ||
        typeof obj.codec !== 'string' ||
        typeof obj.frameMs !== 'number'
      ) {
        return { message: null, error: 'hello missing fields' };
      }
      return {
        message: {
          t: 'hello',
          v: obj.v,
          token: obj.token,
          sampleRate: obj.sampleRate,
          channels: obj.channels,
          codec: obj.codec as 'pcm16' | 'opus',
          frameMs: obj.frameMs,
        },
        error: null,
      };
    }
    case 'welcome': {
      if (
        typeof obj.sessionId !== 'string' ||
        typeof obj.audioPort !== 'number' ||
        typeof obj.targetBufferMs !== 'number'
      ) {
        return { message: null, error: 'welcome missing fields' };
      }
      return { message: { t: 'welcome', sessionId: obj.sessionId, audioPort: obj.audioPort, targetBufferMs: obj.targetBufferMs }, error: null };
    }
    case 'mute': {
      if (typeof obj.value !== 'boolean') {
        return { message: null, error: 'mute missing value' };
      }
      return { message: { t: 'mute', value: obj.value }, error: null };
    }
    case 'volume': {
      if (typeof obj.value !== 'number') {
        return { message: null, error: 'volume missing value' };
      }
      return { message: { t: 'volume', value: obj.value }, error: null };
    }
    case 'bye':
      return { message: { t: 'bye' }, error: null };
    case 'stats': {
      if (
        typeof obj.lossPct !== 'number' ||
        typeof obj.bufferMs !== 'number' ||
        typeof obj.seqGaps !== 'number' ||
        typeof obj.reconnects !== 'number'
      ) {
        return { message: null, error: 'stats missing fields' };
      }
      return { message: { t: 'stats', lossPct: obj.lossPct, bufferMs: obj.bufferMs, seqGaps: obj.seqGaps, reconnects: obj.reconnects }, error: null };
    }
    case 'error': {
      if (typeof obj.code !== 'string' || typeof obj.message !== 'string') {
        return { message: null, error: 'error missing fields' };
      }
      return { message: { t: 'error', code: obj.code, message: obj.message }, error: null };
    }
    default:
      return { message: null, error: `unknown t: ${t}` };
  }
}

export function encodeCtrl(message: CtrlMessage): string {
  return JSON.stringify(message);
}
