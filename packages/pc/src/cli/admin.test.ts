import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { connect, type Socket } from 'node:net';
import { ADMIN_TCP_PORT, AdminServer, pipePath } from './adminServer.js';
import { adminRequest } from './adminClient.js';

interface RawResponse {
  id: number | string | null;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

function connectRaw(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const tryTcp = () => {
      const socket = connect({ port: ADMIN_TCP_PORT, host: '127.0.0.1' });
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.removeListener('error', reject);
        resolve(socket);
      });
    };

    if (process.platform !== 'win32') {
      tryTcp();
      return;
    }

    const socket = connect(pipePath());
    socket.once('error', tryTcp);
    socket.once('connect', () => {
      socket.removeListener('error', tryTcp);
      resolve(socket);
    });
  });
}

async function rawRequest(payload: unknown): Promise<RawResponse> {
  const socket = await connectRaw();
  return new Promise<RawResponse>((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout'));
    }, 2000);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const index = buffer.indexOf('\n');
      if (index < 0) return;
      clearTimeout(timer);
      socket.destroy();
      resolve(JSON.parse(buffer.slice(0, index)) as RawResponse);
    });
    socket.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    socket.write(JSON.stringify(payload) + '\n');
  });
}

describe('canal administrativo local', () => {
  let server: AdminServer;
  let stopRequested = false;

  before(async () => {
    server = new AdminServer(
      async (cmd, args) => {
        if (cmd === 'echo') return { ok: true, data: { args } };
        if (cmd === 'fail') return { ok: false, error: { code: 'no_such_session', message: 'sessão ab12 não existe' } };
        if (cmd === 'stop') return { ok: true, data: { stopping: true }, stop: true };
        return { ok: false, error: { code: 'unknown', message: `comando ${cmd} não existe` } };
      },
      {
        onStop: () => {
          stopRequested = true;
        },
      }
    );
    await server.start();
  });

  after(async () => {
    await server.stop();
  });

  it('responde comando autenticado', async () => {
    const response = await adminRequest('echo', ['a', 'b']);
    assert.equal(response.ok, true);
    assert.deepEqual((response.data as { args: string[] }).args, ['a', 'b']);
  });

  it('rejeita token inválido', async () => {
    const response = await rawRequest({ id: 1, cmd: 'echo', args: [], token: 'x'.repeat(64) });
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, 'unauthorized');
  });

  it('devolve erro estruturado do handler', async () => {
    const response = await adminRequest('fail');
    assert.equal(response.ok, false);
    assert.equal(response.error?.code, 'no_such_session');
    assert.match(response.error?.message ?? '', /sessão ab12/);
  });

  it('comando stop dispara onStop', async () => {
    const response = await adminRequest('stop');
    assert.equal(response.ok, true);
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(stopRequested, true);
  });
});
