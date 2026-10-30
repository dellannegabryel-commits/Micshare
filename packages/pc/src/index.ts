import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AudioServer, type ServerConfig } from './audioServer.js';
import { AudioSink } from './sink.js';
import { VERSION } from './serverState.js';
import { startRepl } from './cli/repl.js';
import { formatDevices } from './cli/format.js';

const HELP = `micshare-pc ${VERSION} — servidor de áudio do PC

Uso:
  micshare-pc [run] [opções]     sobe o servidor e abre o prompt (padrão)
  micshare-pc run --no-repl      sobe o servidor sem prompt
  micshare-pc devices [--json]   lista as saídas de áudio
  micshare-pc help               esta ajuda
  micshare-pc version            versão

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
  --json                   saída JSON (no REPL, equivale a --json por comando)
  --no-repl                não abre o prompt
  --list-devices           alias de "devices"
  --install-vbcable        executa o instalador do VB-Cable (precisa de Admin)
  --help, -h               esta ajuda
  --version, -V            versão

Fase 2 (daemon/controle externo): status, ctl, daemon — ainda não disponíveis.`;

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
  'list-devices'?: boolean;
  'install-vbcable'?: boolean;
  help?: boolean;
  version?: boolean;
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

async function runDevices(json: boolean): Promise<void> {
  try {
    const devices = await AudioSink.listDevices();
    if (json) console.log(JSON.stringify(devices, null, 2));
    else console.log(formatDevices(devices));
  } catch (err) {
    console.error('não foi possível listar os dispositivos:', (err as Error).message);
    process.exit(1);
  }
}

function installVBCable(): void {
  const script = fileURLToPath(new URL('../install-vbcable.ps1', import.meta.url));
  console.log('[micshare] iniciando instalador VB-Cable...');
  const ps = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'inherit' });
  ps.on('close', (code) => process.exit(code ?? 0));
}

function unsupported(command: string): never {
  console.error(`"${command}" ainda não existe nesta versão (Fase 1).`);
  console.error('Use o prompt do "micshare-pc run" ou aguarde a Fase 2 (daemon + controle externo).');
  process.exit(3);
}

async function main(): Promise<void> {
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
    await runDevices(json);
    return;
  }

  if (command === 'status' || command === 'ctl' || command === 'daemon') {
    unsupported(command);
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

  const server = new AudioServer(buildConfig(values));

  try {
    await server.start();
  } catch (err) {
    console.error('[micshare] falha ao iniciar:', (err as Error).message);
    process.exit(1);
  }

  if (!values['no-repl']) {
    await startRepl(server, { json });
    return;
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[micshare] ${signal} recebido, encerrando...`);
    await server.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  await new Promise<void>(() => {
    // mantém o processo vivo; o shutdown encerra explicitamente
  });
}

void main().catch((err) => {
  console.error('[micshare] erro fatal:', (err as Error).message);
  process.exit(1);
});
