// Cliente do canal administrativo local. Tenta o named pipe no Windows e cai
// para TCP 127.0.0.1:41237. Timeout curto para `status` responder rápido.
import { connect, type Socket } from 'node:net';
import { ADMIN_TCP_PORT, pipePath, readToken } from './adminServer.js';

export interface AdminResponse {
  id: number | string | null;
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  stop?: boolean;
}

export class AdminUnavailableError extends Error {}

function connectOnce(target: string | number, timeoutMs: number): Promise<Socket> {
  return new Promise<Socket>((resolve, reject) => {
    const socket =
      typeof target === 'number'
        ? connect({ port: target, host: '127.0.0.1' })
        : connect(target);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('timeout ao conectar'));
    }, timeoutMs);

    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    socket.once('error', onError);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.removeListener('error', onError);
      resolve(socket);
    });
  });
}

async function connectAdmin(timeoutMs: number): Promise<Socket> {
  const errors: string[] = [];

  if (process.platform === 'win32') {
    try {
      return await connectOnce(pipePath(), timeoutMs);
    } catch (err) {
      errors.push(`pipe: ${(err as Error).message}`);
    }
  }

  try {
    return await connectOnce(ADMIN_TCP_PORT, timeoutMs);
  } catch (err) {
    errors.push(`tcp: ${(err as Error).message}`);
  }

  throw new AdminUnavailableError(`servidor não está rodando (${errors.join('; ')})`);
}

/** Envia um comando e espera a resposta. Lança AdminUnavailableError se não houver servidor. */
export async function adminRequest(
  cmd: string,
  args: string[] = [],
  timeoutMs = 2000
): Promise<AdminResponse> {
  const token = readToken();
  if (!token) {
    throw new AdminUnavailableError('token administrativo não encontrado (servidor nunca iniciou)');
  }

  const socket = await connectAdmin(timeoutMs);

  return new Promise<AdminResponse>((resolve, reject) => {
    let buffer = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error(`timeout de ${timeoutMs}ms aguardando resposta`)));
    }, timeoutMs);

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const index = buffer.indexOf('\n');
      if (index < 0) return;

      const line = buffer.slice(0, index).trim();
      try {
        const response = JSON.parse(line) as AdminResponse;
        finish(() => resolve(response));
      } catch {
        finish(() => reject(new Error('resposta inválida do servidor')));
      }
    });

    socket.on('error', (err) => finish(() => reject(err)));
    socket.on('close', () => finish(() => reject(new Error('conexão encerrada sem resposta'))));

    socket.write(JSON.stringify({ id: 1, cmd, args, token }) + '\n');
  });
}

/** Ping rápido; nunca lança. */
export async function isServerRunning(timeoutMs = 500): Promise<boolean> {
  try {
    const response = await adminRequest('ping', [], timeoutMs);
    return response.ok;
  } catch {
    return false;
  }
}
