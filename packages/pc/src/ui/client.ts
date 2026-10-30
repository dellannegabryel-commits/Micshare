// Wrapper fino sobre o canal administrativo. Usado pela Web UI local.
// Nunca fala direto com UDP/WS do celular — só com 127.0.0.1/pipe + token.
import { adminRequest, isServerRunning } from '../cli/adminClient.js';
import { daemonInfoIsAlive } from '../cli/daemon.js';
import { readToken } from '../cli/adminServer.js';

export interface UiHealth {
  running: boolean;
  pid: number | null;
  transport: string | null;
  hasToken: boolean;
}

export interface AdminResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

/** Retorna o status do servidor se rodando, senão null. */
export async function getStatus<T = unknown>(): Promise<T | null> {
  if (!(await isServerRunning())) return null;
  const response = await adminRequest('status', [], 3000);
  if (!response.ok) throw new Error(response.error?.message ?? 'falha ao obter status');
  return response.data as T;
}

/** Lista sessões ativas. */
export async function getSessions<T = unknown>(): Promise<T[]> {
  if (!(await isServerRunning())) return [];
  const response = await adminRequest('clients', [], 3000);
  if (!response.ok) throw new Error(response.error?.message ?? 'falha ao listar sessões');
  const data = response.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Lista dispositivos de saída. */
export async function getDevices<T = unknown>(): Promise<T[]> {
  if (!(await isServerRunning())) {
    // fallback para listagem local mesmo com daemon parado
    try {
      const { AudioSink } = await import('../sink.js');
      const devices = await AudioSink.listDevices();
      return devices as T[];
    } catch {
      return [];
    }
  }
  const response = await adminRequest('devices', [], 3000);
  if (!response.ok) throw new Error(response.error?.message ?? 'falha ao listar dispositivos');
  const data = response.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Envia um comando ao servidor em execução. */
export async function sendCommand<T = unknown>(cmd: string, args: string[] = []): Promise<AdminResponse<T>> {
  if (!(await isServerRunning())) {
    return { ok: false, error: { code: 'not_running', message: 'servidor não está rodando' } };
  }
  const timeout = cmd === 'restart' ? 15000 : 5000;
  const response = await adminRequest(cmd, args, timeout);
  return response as AdminResponse<T>;
}

/** Inicia o daemon (reutiliza flags do config em disco via daemon start). */
export async function startDaemon(configArgs: string[] = []): Promise<AdminResponse> {
  if (await isServerRunning()) {
    return { ok: true, data: { alreadyRunning: true } };
  }
  try {
    const { spawnDaemon } = await import('../cli/daemon.js');
    const spawned = spawnDaemon(configArgs);
    // espera ficar disponível
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await isServerRunning(300)) {
        return { ok: true, data: { pid: spawned.pid } };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return { ok: false, error: { code: 'timeout', message: 'daemon não respondeu em 15s' } };
  } catch (err) {
    return { ok: false, error: { code: 'error', message: (err as Error).message } };
  }
}

/** Para o daemon via canal admin ou força por PID. */
export async function stopDaemon(): Promise<AdminResponse> {
  if (await isServerRunning()) {
    try {
      const response = await adminRequest('stop', [], 3000);
      if (response.ok) {
        await new Promise((r) => setTimeout(r, 500));
        return { ok: true, data: { stopping: true } };
      }
    } catch {
      // fallback
    }
  }

  try {
    const { daemonInfoIsAlive, killPid, waitForExit, removeDaemonInfo } = await import('../cli/daemon.js');
    const info = daemonInfoIsAlive();
    if (!info) return { ok: true, data: { alreadyStopped: true } };
    if (killPid(info.pid)) {
      await waitForExit(info.pid, 3000);
      removeDaemonInfo();
      return { ok: true, data: { killed: true, pid: info.pid } };
    }
    return { ok: false, error: { code: 'error', message: 'não foi possível encerrar o processo' } };
  } catch (err) {
    return { ok: false, error: { code: 'error', message: (err as Error).message } };
  }
}

export async function health(): Promise<UiHealth> {
  const running = await isServerRunning();
  const info = running ? daemonInfoIsAlive() : null;
  return {
    running,
    pid: info?.pid ?? null,
    transport: null,
    hasToken: Boolean(readToken()),
  };
}
