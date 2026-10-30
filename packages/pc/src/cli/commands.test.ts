import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AudioServer } from '../audioServer.js';
import type { ServerStatus } from '../serverState.js';
import { CommandError, runCommand, type CommandContext } from './commands.js';

interface StubState {
  mute: boolean;
  volume: number;
  pairing: { enabled: boolean; code: string };
  beacon: { running: boolean; intervalMs: number };
  disconnected: Array<string>;
  restarted: Array<string>;
  device: string | null;
}

function makeStatus(state: StubState): ServerStatus {
  return {
    version: '0.1.0',
    pid: 1234,
    startedAt: Date.now() - 5000,
    uptimeMs: 5000,
    running: true,
    ports: { audio: 41235, control: 41236, beacon: 41234 },
    addresses: ['192.168.0.10'],
    device: { id: 7, name: 'CABLE Input', channels: 2, requested: 'CABLE Input' },
    codec: 'pcm',
    mute: state.mute,
    volume: state.volume,
    beacon: {
      running: state.beacon.running,
      intervalMs: state.beacon.intervalMs,
      pairingEnabled: state.pairing.enabled,
    },
    sessions: [],
    metrics: {
      received: 100,
      lost: 2,
      gaps: 1,
      bufferMs: 30,
      underruns: 0,
      fastForwards: 0,
      flushes: 0,
      fps: 99.5,
      lossPct: 2,
      fpsAvg: 100,
      lossPctAvg: 2,
      windowMs: 1000,
      updatedAt: Date.now(),
    },
  };
}

function makeServer(state: StubState): AudioServer {
  const stub = {
    getStatus: () => makeStatus(state),
    getMetrics: () => makeStatus(state).metrics,
    getSessions: () => [],
    getVolume: () => state.volume,
    setVolume: (v: number) => {
      state.volume = v;
      return v;
    },
    setMute: (v: boolean) => {
      state.mute = v;
      return v;
    },
    toggleMute: () => {
      state.mute = !state.mute;
      return state.mute;
    },
    disconnect: (target: string) => {
      state.disconnected.push(target);
      return target === 'all' ? 2 : 1;
    },
    restart: async (scope: string) => {
      state.restarted.push(scope);
    },
    getPairing: () => state.pairing,
    setPairing: async (enabled: boolean, code: string) => {
      state.pairing = { enabled, code };
    },
    setBeaconEnabled: (enabled: boolean) => {
      state.beacon.running = enabled;
    },
    setBeaconInterval: (ms: number) => {
      state.beacon.intervalMs = ms;
    },
    setDevice: async (name: string) => {
      state.device = name;
      return { id: 9, name, channels: 2 };
    },
  };
  return stub as unknown as AudioServer;
}

function makeContext(state: StubState, json = false): { ctx: CommandContext; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    ctx: { server: makeServer(state), json, out: (l) => out.push(l), err: (l) => err.push(l) },
    out,
    err,
  };
}

function baseState(): StubState {
  return {
    mute: false,
    volume: 1,
    pairing: { enabled: false, code: '' },
    beacon: { running: true, intervalMs: 1000 },
    disconnected: [],
    restarted: [],
    device: null,
  };
}

describe('runCommand', () => {
  it('status --json emite JSON válido sem ANSI', async () => {
    const { ctx, out } = makeContext(baseState());
    await runCommand(ctx, 'status --json');
    assert.equal(out.length, 1);
    assert.ok(!out[0].includes('\x1b['));
    const parsed = JSON.parse(out[0]);
    assert.equal(parsed.version, '0.1.0');
    assert.equal(parsed.ports.audio, 41235);
  });

  it('status sem --json imprime texto', async () => {
    const { ctx, out } = makeContext(baseState());
    await runCommand(ctx, 'status');
    assert.match(out.join('\n'), /micshare-pc 0\.1\.0/);
    assert.match(out.join('\n'), /CABLE Input/);
  });

  it('mute alterna e persiste', async () => {
    const state = baseState();
    const { ctx, out } = makeContext(state);
    await runCommand(ctx, 'mute on');
    assert.equal(state.mute, true);
    await runCommand(ctx, 'mute');
    assert.equal(state.mute, false);
    await runCommand(ctx, 'mute off');
    assert.equal(state.mute, false);
    assert.match(out.join('\n'), /mute off/);
  });

  it('volume aceita valor relativo', async () => {
    const state = baseState();
    const { ctx } = makeContext(state);
    await runCommand(ctx, 'volume +0.5');
    assert.equal(state.volume, 1.5);
    await runCommand(ctx, 'volume 2');
    assert.equal(state.volume, 2);
  });

  it('disconnect sem argumento desconecta todos', async () => {
    const state = baseState();
    const { ctx, out } = makeContext(state);
    await runCommand(ctx, 'disconnect');
    assert.deepEqual(state.disconnected, ['all']);
    assert.match(out.join('\n'), /2 sessão/);
  });

  it('restart --sink usa escopo sink', async () => {
    const state = baseState();
    const { ctx } = makeContext(state);
    await runCommand(ctx, 'restart --sink');
    assert.deepEqual(state.restarted, ['sink']);
  });

  it('restart sem flags usa all', async () => {
    const state = baseState();
    const { ctx } = makeContext(state);
    await runCommand(ctx, 'restart');
    assert.deepEqual(state.restarted, ['all']);
  });

  it('device junta argumentos não citados', async () => {
    const state = baseState();
    const { ctx, out } = makeContext(state);
    await runCommand(ctx, 'device CABLE Input');
    assert.equal(state.device, 'CABLE Input');
    assert.match(out.join('\n'), /CABLE Input/);
  });

  it('pair rotate liga e gera código de 6 dígitos', async () => {
    const state = baseState();
    const { ctx } = makeContext(state);
    await runCommand(ctx, 'pair rotate');
    assert.equal(state.pairing.enabled, true);
    assert.match(state.pairing.code, /^\d{6}$/);
  });

  it('beacon interval atualiza o intervalo', async () => {
    const state = baseState();
    const { ctx } = makeContext(state);
    await runCommand(ctx, 'beacon interval 500');
    assert.equal(state.beacon.intervalMs, 500);
  });

  it('stop sinaliza encerramento', async () => {
    const { ctx } = makeContext(baseState());
    const result = await runCommand(ctx, 'stop');
    assert.equal(result.stop, true);
  });

  it('comando desconhecido lança CommandError', async () => {
    const { ctx } = makeContext(baseState());
    await assert.rejects(() => runCommand(ctx, 'frobnicate'), CommandError);
  });

  it('help lista comandos', async () => {
    const { ctx, out } = makeContext(baseState());
    await runCommand(ctx, 'help');
    assert.match(out.join('\n'), /status/);
    assert.match(out.join('\n'), /disconnect/);
  });
});
