// Registry único de comandos. O mesmo registry serve o REPL (Fase 1) e o
// daemon local (Fase 2): muda só o transporte, não o comando.
import type { AudioServer } from '../audioServer.js';
import { AudioSink } from '../sink.js';
import type { RestartScope } from '../audioServer.js';
import {
  formatDevices,
  formatMetrics,
  formatMute,
  formatSessions,
  formatStatus,
  formatVolume,
} from './format.js';
import {
  generatePairingCode,
  parseLine,
  parseMuteArg,
  parseRestartScope,
  parseVolumeArg,
} from './parse.js';

export interface CommandContext {
  server: AudioServer;
  json: boolean;
  out: (line: string) => void;
  err: (line: string) => void;
}

export interface CommandResult {
  stop?: boolean;
}

export interface CommandDef {
  name: string;
  aliases?: string[];
  usage: string;
  description: string;
  run: (ctx: CommandContext, args: string[]) => Promise<CommandResult | void> | CommandResult | void;
}

export class CommandError extends Error {}

const printJson = (ctx: CommandContext, data: unknown): void => {
  ctx.out(JSON.stringify(data, null, 2));
};

export const commands: CommandDef[] = [
  {
    name: 'status',
    usage: 'status [--json]',
    description: 'estado completo do servidor (portas, device, sessões, áudio)',
    run(ctx) {
      const status = ctx.server.getStatus();
      if (ctx.json) printJson(ctx, status);
      else ctx.out(formatStatus(status));
    },
  },
  {
    name: 'stats',
    usage: 'stats [--json]',
    description: 'métricas de áudio da janela de 1 s',
    run(ctx) {
      const metrics = ctx.server.getMetrics();
      if (ctx.json) printJson(ctx, metrics);
      else ctx.out(formatMetrics(metrics));
    },
  },
  {
    name: 'clients',
    aliases: ['sessions'],
    usage: 'clients [--json]',
    description: 'sessões conectadas',
    run(ctx) {
      const sessions = ctx.server.getSessions();
      if (ctx.json) printJson(ctx, sessions);
      else ctx.out(formatSessions(sessions));
    },
  },
  {
    name: 'devices',
    usage: 'devices [--json]',
    description: 'lista as saídas de áudio disponíveis',
    async run(ctx) {
      const devices = await AudioSink.listDevices();
      if (ctx.json) {
        printJson(ctx, devices);
        return;
      }
      const current = ctx.server.getStatus().device?.id ?? null;
      ctx.out(formatDevices(devices, current));
    },
  },
  {
    name: 'device',
    usage: 'device <substring>',
    description: 'troca o dispositivo de saída em runtime (com rollback)',
    async run(ctx, args) {
      const wanted = args.join(' ').trim();
      if (!wanted) throw new CommandError('uso: device <substring>');
      const device = await ctx.server.setDevice(wanted);
      if (ctx.json) printJson(ctx, device);
      else ctx.out(`saída de áudio: [${device.id}] ${device.name} (${device.channels}ch)`);
    },
  },
  {
    name: 'mute',
    usage: 'mute [on|off|toggle]',
    description: 'muta/desmuta a saída de áudio',
    run(ctx, args) {
      const arg = parseMuteArg(args[0]);
      const mute = arg === 'toggle' ? ctx.server.toggleMute() : ctx.server.setMute(arg === 'on');
      if (ctx.json) printJson(ctx, { mute });
      else ctx.out(formatMute(mute));
    },
  },
  {
    name: 'volume',
    usage: 'volume <0..4 | +0.1 | -0.1>',
    description: 'ajusta o ganho da saída (clamp 0..4)',
    run(ctx, args) {
      if (!args[0]) throw new CommandError('uso: volume <0..4 | +0.1 | -0.1>');
      const next = parseVolumeArg(args[0], ctx.server.getVolume());
      const volume = ctx.server.setVolume(next);
      if (ctx.json) printJson(ctx, { volume });
      else ctx.out(formatVolume(volume));
    },
  },
  {
    name: 'disconnect',
    usage: 'disconnect [<sessionId>|all]',
    description: 'encerra uma sessão (ou todas) enviando bye',
    run(ctx, args) {
      const target = args[0] ?? 'all';
      const closed = ctx.server.disconnect(target);
      if (ctx.json) printJson(ctx, { target, closed });
      else ctx.out(closed === 0 ? 'nenhuma sessão para desconectar' : `${closed} sessão(ões) encerrada(s)`);
    },
  },
  {
    name: 'restart',
    usage: 'restart [--sink|--control|--beacon|--all]',
    description: 'reinicia parte do servidor sem matar o processo',
    async run(ctx, args) {
      const scope: RestartScope = parseRestartScope(args);
      const startedAt = Date.now();
      await ctx.server.restart(scope);
      const elapsed = Date.now() - startedAt;
      const status = ctx.server.getStatus();
      if (ctx.json) printJson(ctx, { scope, elapsedMs: elapsed, status });
      else ctx.out(`restart ${scope} concluído em ${elapsed}ms · ${status.sessions.length} sessão(ões) ativa(s)`);
    },
  },
  {
    name: 'pair',
    usage: 'pair [on|off|rotate]',
    description: 'código de pareamento de 6 dígitos',
    async run(ctx, args) {
      const action = (args[0] ?? '').toLowerCase();
      const current = ctx.server.getPairing();

      if (action === '') {
        if (ctx.json) printJson(ctx, { enabled: current.enabled, code: current.enabled ? current.code : null });
        else {
          ctx.out(
            current.enabled
              ? `pareamento ligado · código ${current.code}`
              : 'pareamento desligado (use "pair on" para ligar)'
          );
        }
        return;
      }

      if (action === 'off') {
        await ctx.server.setPairing(false, '');
        if (ctx.json) printJson(ctx, { enabled: false, code: null });
        else ctx.out('pareamento desligado');
        return;
      }

      if (action === 'on' || action === 'rotate') {
        const code = action === 'on' && current.enabled && current.code ? current.code : generatePairingCode();
        await ctx.server.setPairing(true, code);
        if (ctx.json) printJson(ctx, { enabled: true, code });
        else ctx.out(`pareamento ligado · código ${code}`);
        return;
      }

      throw new CommandError('uso: pair [on|off|rotate]');
    },
  },
  {
    name: 'beacon',
    usage: 'beacon [on|off|interval <ms>]',
    description: 'liga/desliga o beacon de descoberta ou muda o intervalo',
    run(ctx, args) {
      const action = (args[0] ?? '').toLowerCase();
      if (action === 'on') ctx.server.setBeaconEnabled(true);
      else if (action === 'off') ctx.server.setBeaconEnabled(false);
      else if (action === 'interval') {
        const ms = Number(args[1]);
        if (!Number.isFinite(ms) || ms < 100) throw new CommandError('uso: beacon interval <ms> (mínimo 100)');
        ctx.server.setBeaconInterval(ms);
      } else if (action !== '') {
        throw new CommandError('uso: beacon [on|off|interval <ms>]');
      }

      const beacon = ctx.server.getStatus().beacon;
      if (ctx.json) printJson(ctx, beacon);
      else ctx.out(`beacon ${beacon.running ? 'on' : 'off'} · intervalo ${beacon.intervalMs}ms`);
    },
  },
  {
    name: 'help',
    aliases: ['?'],
    usage: 'help [comando]',
    description: 'lista comandos ou detalha um comando',
    run(ctx, args) {
      const target = args[0]?.toLowerCase();
      if (target) {
        const cmd = findCommand(target);
        if (!cmd) throw new CommandError(`comando desconhecido: ${target}`);
        ctx.out(`${cmd.usage}\n  ${cmd.description}`);
        return;
      }
      const width = Math.max(...commands.map((c) => c.usage.length));
      ctx.out(
        ['Comandos:', ...commands.map((c) => `  ${c.usage.padEnd(width)}  ${c.description}`)].join('\n')
      );
    },
  },
  {
    name: 'stop',
    aliases: ['quit', 'exit'],
    usage: 'stop',
    description: 'encerra o servidor graciosamente',
    run(ctx) {
      ctx.out('encerrando...');
      return { stop: true };
    },
  },
];

export function findCommand(name: string): CommandDef | undefined {
  const needle = name.toLowerCase();
  return commands.find((c) => c.name === needle || c.aliases?.includes(needle));
}

/** Executa uma linha do REPL (ou um comando vindo do daemon na Fase 2). */
export async function runCommand(ctx: CommandContext, line: string): Promise<CommandResult> {
  const parsed = parseLine(line);
  if (!parsed) return {};

  const cmd = findCommand(parsed.command);
  if (!cmd) {
    throw new CommandError(`comando desconhecido: "${parsed.command}". Use "help" para ver os comandos.`);
  }

  let json = ctx.json;
  const args = parsed.args.filter((arg) => {
    if (arg === '--json') {
      json = true;
      return false;
    }
    return true;
  });

  return (await cmd.run({ ...ctx, json }, args)) ?? {};
}
