import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { AudioServer, type ServerConfig } from './audioServer.js';
import { AudioSink } from './sink.js';
import { VERSION, type ServerStatus } from './serverState.js';
import { startRepl } from './cli/repl.js';
import { formatAdminResult, formatDevices, formatStatus } from './cli/format.js';
import { AdminServer, type AdminResult } from './cli/adminServer.js';
import { adminRequest, isServerRunning } from './cli/adminClient.js';
import { CommandError, runCommandArgs } from './cli/commands.js';
import {
  daemonInfoIsAlive,
  killPid,
  removeDaemonInfo,
  spawnDaemon,
  waitForExit,
  writeDaemonInfo,
} from './cli/daemon.js';
import { startUiServer } from './ui/server.js';

const HELP = `micshare-pc ${VERSION} — servidor de áudio do PC

Uso:
  micshare-pc [run] [opções]      sobe o servidor e abre o prompt (padrão)
  micshare-pc run --no-repl       sobe o servidor sem prompt
  micshare-pc devices [--json]    lista as saídas de áudio
  micshare-pc status [--json]     consulta o servidor em execução (exit 2 se parado)
  micshare-pc ctl <cmd> [args]    envia um comando ao servidor em execução
  micshare-pc daemon start|stop|status
  micshare-pc help                esta ajuda
  micshare-pc version             versão

Opções:
  --port N                 porta UDP de áudio (padrão 41235)
  --control-port N         porta WebSocket de controle (padrão 41236)
  --beacon-port N          porta UDP do beacon (padrão 41234)
  --beacon-interval MS     intervalo do beacon (padrão 1000)
  --device "substr"        dispositivo de saída (substring do nome)
  --name NAME              nome anunciado no beacon (padrão: hostname)
  --pairing                exige código de pareamento no hello
  --pairing-code CODE      código de pareamento de 6 dígitos
  --verbose, -v            linha de status 1 Hz no terminal
  --json                   saída JSON
  --no-repl                não abre o prompt
  --no-open                não abre o navegador (com "ui")
  --list-devices           alias de "devices"
  --install-vbcable        executa o instalador do VB-Cable (precisa de Admin)
  --help, -h               esta ajuda
  --version, -V            versão

Comandos do prompt: status, stats, clients, devices, device, mute, volume,
disconnect, restart, pair, beacon, help, stop.`;

interface CliValues {
  port?: string;
  'control-port'?: string;
  'beacon-port'?: string;
  'beacon-interval'?: string;
  device?: string;
  name?: string;
  pairing?: boolean;
  'pairing-code'?: string;
  verbose?: boolean;
  json?: boolean;
  'no-repl'?: boolean;
  'no-open'?: boolean;
  'list-devices'?: boolean;
  'install-vbcable'?: boolean;
  help?: boolean;
  version?: boolean;
}

let activeServer: AudioServer | null = null;
let activeAdmin: AdminServer | null = null;
let shuttingDown = false;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Flags globais que consomem o próximo token como valor. */
const VALUE_FLAGS = new Set([
  '--port',
  '--control-port',
  '--beacon-port',
  '--beacon-interval',
  '--device',
  '--name',
  '--pairing-code',
]);

/**
 * Primeiro token que não é flag. Necessário para tratar `ctl` antes do
 * parseArgs estrito, já que o comando remoto pode ter flags próprias
 * (`ctl restart --sink`).
 */
function findSubcommand(args: string[]): { index: number; name: string } | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('-')) {
      if (VALUE_FLAGS.has(arg) && i + 1 < args.length) i += 1;
      continue;
    }
    return { index: i, name: arg.toLowerCase() };
  }
  return null;
}

async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  try {
    await activeServer?.stop();
  } catch (err) {
    console.error('[micshare] erro ao encerrar:', (err as Error).message);
  }
  try {
    await activeAdmin?.stop();
  } catch {
    // ignora
  }

  removeDaemonInfo();
  process.exit(code);
}

function parseNumber(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`valor inválido para ${flag}: "${raw}"`);
    process.exit(1);
  }
  return value;
}

function buildConfig(values: CliValues): ServerConfig {
  const pairingCode = values['pairing-code'];
  return {
    audioPort: parseNumber('--port', values.port),
    controlPort: parseNumber('--control-port', values['control-port']),
    beaconPort: parseNumber('--beacon-port', values['beacon-port']),
    beaconIntervalMs: parseNumber('--beacon-interval', values['beacon-interval']),
    deviceSubstring: values.device,
    name: values.name,
    verbose: values.verbose,
    pairingCode,
    requirePairing: Boolean(values.pairing || pairingCode),
  };
}

/** Reconstrução das flags para o processo do daemon. */
function configToArgs(values: CliValues): string[] {
  const out: string[] = [];
  if (values.port) out.push('--port', values.port);
  if (values['control-port']) out.push('--control-port', values['control-port']);
  if (values['beacon-port']) out.push('--beacon-port', values['beacon-port']);
  if (values['beacon-interval']) out.push('--beacon-interval', values['beacon-interval']);
  if (values.device) out.push('--device', values.device);
  if (values.name) out.push('--name', values.name);
  if (values.pairing) out.push('--pairing');
  if (values['pairing-code']) out.push('--pairing-code', values['pairing-code']);
  if (values.verbose) out.push('--verbose');
  return out;
}

// ------------------------------------------------------------------ canal admin

async function handleAdmin(cmd: string, args: string[]): Promise<AdminResult> {
  if (cmd === 'ping') {
    return {
      ok: true,
      data: { pong: true, pid: process.pid, version: VERSION },
    };
  }
  if (cmd === 'shutdown') {
    return { ok: true, data: { stopping: true }, stop: true };
  }
  if (!activeServer) {
    return { ok: false, error: { code: 'not_running', message: 'servidor não iniciado' } };
  }

  const lines: string[] = [];
  const ctx = {
    server: activeServer,
    json: true,
    out: (line: string) => lines.push(line),
    err: (line: string) => lines.push(line),
  };

  try {
    const result = await runCommandArgs(ctx, cmd, args);
    let data: unknown;
    if (lines.length > 0) {
      const text = lines.join('\n');
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { ok: true, data, stop: result.stop };
  } catch (err) {
    return {
      ok: false,
      error: {
        code: err instanceof CommandError ? 'bad_command' : 'error',
        message: (err as Error).message,
      },
    };
  }
}

async function startServer(config: ServerConfig): Promise<AudioServer> {
  const server = new AudioServer(config);
  await server.start();
  activeServer = server;

  const admin = new AdminServer(handleAdmin, { onStop: () => void shutdown(0) });
  activeAdmin = admin;
  try {
    await admin.start();
  } catch (err) {
    console.warn('[admin] canal de controle externo indisponível:', (err as Error).message);
  }

  writeDaemonInfo({ pid: process.pid, startedAt: Date.now(), entry: process.argv[1] ?? null, args: [] });
  return server;
}

// ------------------------------------------------------------------ subcomandos remotos

async function remoteStatus(json: boolean): Promise<number> {
  if (!(await isServerRunning())) {
    console.error('servidor não está rodando');
    return 2;
  }

  const response = await adminRequest('status');
  if (!response.ok) {
    console.error(response.error?.message ?? 'erro ao consultar o servidor');
    return 1;
  }

  if (json) console.log(JSON.stringify(response.data, null, 2));
  else console.log(formatStatus(response.data as ServerStatus));
  return 0;
}

async function remoteCtl(cmd: string, args: string[], json: boolean): Promise<number> {
  if (!(await isServerRunning())) {
    console.error('servidor não está rodando');
    return 2;
  }

  const timeout = cmd === 'restart' ? 15000 : 3000;
  const response = await adminRequest(cmd, args, timeout);
  if (!response.ok) {
    console.error(response.error?.message ?? 'erro ao executar o comando');
    return 1;
  }

  if (json) console.log(JSON.stringify(response.data ?? null, null, 2));
  else console.log(formatAdminResult(cmd, response.data));
  return 0;
}

async function handleDaemon(action: string, values: CliValues, json: boolean): Promise<number> {
  if (action === 'start') {
    if (await isServerRunning()) {
      console.log('servidor já está rodando');
      return 0;
    }

    let spawned;
    try {
      spawned = spawnDaemon(configToArgs(values));
    } catch (err) {
      console.error('falha ao iniciar o daemon:', (err as Error).message);
      return 1;
    }

    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (await isServerRunning(300)) {
        if (json) console.log(JSON.stringify({ running: true, pid: spawned.pid }, null, 2));
        else console.log(`daemon iniciado · pid ${spawned.pid}`);
        return 0;
      }
      await sleep(300);
    }

    console.error('daemon não respondeu em 15s (verifique o dispositivo de áudio e as portas)');
    return 1;
  }

  if (action === 'stop') {
    if (await isServerRunning()) {
      try {
        await adminRequest('stop', [], 3000);
      } catch {
        // cai no fallback por PID
      }

      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (!(await isServerRunning(200))) {
          removeDaemonInfo();
          if (json) console.log(JSON.stringify({ running: false }, null, 2));
          else console.log('daemon parado');
          return 0;
        }
        await sleep(200);
      }
    }

    const info = daemonInfoIsAlive();
    if (info && killPid(info.pid)) {
      await waitForExit(info.pid, 3000);
      removeDaemonInfo();
      if (json) console.log(JSON.stringify({ running: false, killed: true }, null, 2));
      else console.log('daemon encerrado à força');
      return 0;
    }

    removeDaemonInfo();
    if (json) console.log(JSON.stringify({ running: false }, null, 2));
    else console.log('servidor não está rodando');
    return 0;
  }

  if (action === 'status') {
    if (!(await isServerRunning())) {
      if (json) console.log(JSON.stringify({ running: false }, null, 2));
      else console.log('servidor parado');
      return 2;
    }

    const response = await adminRequest('status');
    if (!response.ok) {
      console.error(response.error?.message ?? 'erro ao consultar o servidor');
      return 1;
    }

    if (json) console.log(JSON.stringify({ running: true, status: response.data }, null, 2));
    else console.log(formatStatus(response.data as ServerStatus));
    return 0;
  }

  console.error(`ação desconhecida para daemon: "${action}" (use start, stop ou status)`);
  return 1;
}

async function runDevices(json: boolean): Promise<number> {
  try {
    const devices = await AudioSink.listDevices();
    if (json) console.log(JSON.stringify(devices, null, 2));
    else console.log(formatDevices(devices));
    return 0;
  } catch (err) {
    console.error('não foi possível listar os dispositivos:', (err as Error).message);
    return 1;
  }
}

function installVBCable(): void {
  const script = fileURLToPath(new URL('../install-vbcable.ps1', import.meta.url));
  console.log('[micshare] iniciando instalador VB-Cable...');
  const ps = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'inherit' });
  ps.on('close', (code) => process.exit(code ?? 0));
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);

  // `ctl` aceita flags do comando remoto (ex: `ctl restart --sink`), então é
  // tratado antes do parseArgs estrito. `--json` é global.
  const earlySub = findSubcommand(rawArgs);
  if (earlySub?.name === 'ctl') {
    const json = rawArgs.includes('--json');
    const remote = rawArgs.slice(earlySub.index + 1).filter((arg) => arg !== '--json');
    const [remoteCmd, ...remoteArgs] = remote;
    if (!remoteCmd) {
      console.error('uso: micshare-pc ctl <comando> [args] [--json]');
      process.exitCode = 1;
      return;
    }
    process.exitCode = await remoteCtl(remoteCmd, remoteArgs, json);
    return;
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      strict: true,
      options: {
        port: { type: 'string' },
        'control-port': { type: 'string' },
        'beacon-port': { type: 'string' },
        'beacon-interval': { type: 'string' },
        device: { type: 'string' },
        name: { type: 'string' },
        pairing: { type: 'boolean' },
        'pairing-code': { type: 'string' },
        verbose: { type: 'boolean', short: 'v' },
        json: { type: 'boolean' },
        'no-repl': { type: 'boolean' },
        'no-open': { type: 'boolean' },
        'list-devices': { type: 'boolean' },
        'install-vbcable': { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'V' },
      },
    });
  } catch (err) {
    console.error((err as Error).message);
    console.error('Use --help para ver as opções.');
    process.exit(1);
  }

  const values = parsed.values as CliValues;
  const [subcommand, ...rest] = parsed.positionals;
  const command = subcommand?.toLowerCase() ?? 'run';
  const json = Boolean(values.json);

  if (values.help || command === 'help') {
    console.log(HELP);
    return;
  }
  if (values.version || command === 'version') {
    console.log(VERSION);
    return;
  }
  if (values['install-vbcable']) {
    installVBCable();
    return;
  }
  if (values['list-devices'] || command === 'devices') {
    process.exitCode = await runDevices(json);
    return;
  }
  if (command === 'status') {
    process.exitCode = await remoteStatus(json);
    return;
  }
  if (command === 'daemon') {
    process.exitCode = await handleDaemon(rest[0] ?? 'status', values, json);
    return;
  }

  if (command === 'ui') {
    const uiPort = parseNumber('--port', values.port) ?? 41238;
    try {
      const { url } = await startUiServer({ port: uiPort, host: '127.0.0.1' });
      if (!values['no-open']) {
        try {
          await open(url);
        } catch (err) {
          console.warn(`não foi possível abrir o navegador: ${(err as Error).message}`);
        }
      }
      console.log('Pressione Ctrl+C para encerrar a UI.');
      process.on('SIGINT', () => process.exit(0));
      process.on('SIGTERM', () => process.exit(0));
      await new Promise<void>(() => {
        // mantém vivo
      });
    } catch (err) {
      console.error('falha ao iniciar a UI:', (err as Error).message);
      process.exit(1);
    }
  }

  if (command !== 'run' && command !== 'dev') {
    console.error(`subcomando desconhecido: "${command}"`);
    console.error('Use --help para ver as opções.');
    process.exit(1);
  }
  if (rest.length > 0) {
    console.error(`argumentos inesperados: ${rest.join(' ')}`);
    process.exit(1);
  }

  let server: AudioServer;
  try {
    server = await startServer(buildConfig(values));
  } catch (err) {
    console.error('[micshare] falha ao iniciar:', (err as Error).message);
    process.exit(1);
  }

  if (!values['no-repl']) {
    await startRepl(server, { json, shutdown: () => shutdown(0) });
    return;
  }

  process.on('SIGINT', () => void shutdown(0));
  process.on('SIGTERM', () => void shutdown(0));
  await new Promise<void>(() => {
    // mantém o processo vivo; shutdown encerra explicitamente
  });
}

void main().catch((err) => {
  console.error('[micshare] erro fatal:', (err as Error).message);
  process.exit(1);
});
