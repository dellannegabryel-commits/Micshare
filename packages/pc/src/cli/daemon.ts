// Ciclo de vida do daemon: PID em %LOCALAPPDATA%\Micshare\daemon.json e
// spawn desacoplado reutilizando o mesmo entrypoint/loader do processo atual
// (funciona tanto em `tsx src/index.ts` quanto em `node dist/index.js`).
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { adminDir, daemonInfoPath } from './adminServer.js';

export interface DaemonInfo {
  pid: number;
  startedAt: number;
  entry: string | null;
  args: string[];
}

export function readDaemonInfo(): DaemonInfo | null {
  try {
    const raw = readFileSync(daemonInfoPath(), 'utf8');
    const parsed = JSON.parse(raw) as DaemonInfo;
    if (typeof parsed.pid !== 'number' || parsed.pid <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeDaemonInfo(info: DaemonInfo): void {
  mkdirSync(adminDir(), { recursive: true });
  writeFileSync(daemonInfoPath(), JSON.stringify(info, null, 2), 'utf8');
}

export function removeDaemonInfo(): void {
  try {
    unlinkSync(daemonInfoPath());
  } catch {
    // já removido
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Remove flags de `--eval` do execArgv antes de reconstruir a linha de comando. */
function sanitizeExecArgv(execArgv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < execArgv.length; i++) {
    const arg = execArgv[i];
    if (arg === '--eval' || arg === '-e' || arg === '--print' || arg === '-p') {
      i += 1; // pula o valor
      continue;
    }
    if (arg.startsWith('--eval=') || arg.startsWith('--print=')) continue;
    out.push(arg);
  }
  return out;
}

export interface SpawnDaemonResult {
  pid: number;
  entry: string;
}

/** Sobe `run --no-repl` desacoplado e registra o PID. */
export function spawnDaemon(configArgs: string[]): SpawnDaemonResult {
  const entry = process.argv[1];
  if (!entry) throw new Error('não foi possível determinar o entrypoint do servidor');

  const child = spawn(process.execPath, [...sanitizeExecArgv(process.execArgv), entry, 'run', '--no-repl', ...configArgs], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: process.env,
  });
  child.unref();

  if (!child.pid) throw new Error('falha ao criar o processo do daemon');

  writeDaemonInfo({ pid: child.pid, startedAt: Date.now(), entry, args: configArgs });
  return { pid: child.pid, entry };
}

export function killPid(pid: number): boolean {
  try {
    process.kill(pid);
    return true;
  } catch {
    return false;
  }
}

export async function waitForExit(pid: number, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isProcessAlive(pid);
}

/** true se há um daemon registrado e vivo. */
export function daemonInfoIsAlive(): DaemonInfo | null {
  const info = readDaemonInfo();
  if (!info) return null;
  return isProcessAlive(info.pid) ? info : null;
}

export function daemonInfoExists(): boolean {
  return existsSync(daemonInfoPath());
}
