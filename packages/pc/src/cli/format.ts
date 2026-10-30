// Formatação de saída para o terminal. Sempre respeita NO_COLOR e --json
// (quem chama decide; aqui só não emitimos ANSI quando desabilitado).
import type { MetricsSnapshot } from '../metrics.js';
import type { DeviceInfo, ServerStatus, SessionInfo } from '../serverState.js';
import { formatDuration, formatShortDuration } from '../serverState.js';

const colorEnabled =
  process.env.NO_COLOR === undefined && process.env.FORCE_COLOR !== '0' && Boolean(process.stdout.isTTY);

const wrap = (open: number, close: number) => (text: string): string =>
  colorEnabled ? `\x1b[${open}m${text}\x1b[${close}m` : text;

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);

const pad = (text: string, width: number): string => (text.length >= width ? text : text + ' '.repeat(width - text.length));

/** Alinha as linhas no formato `rótulo      valor`. */
function field(label: string, value: string): string {
  return `${dim(pad(label, 11))} ${value}`;
}

const onOff = (value: boolean): string => (value ? green('on') : red('off'));

export function formatMetrics(m: MetricsSnapshot): string {
  return [
    `received ${m.received}  lost ${m.lost}  loss ${m.lossPct}%`,
    `gaps ${m.gaps}  underruns ${m.underruns}  fastForwards ${m.fastForwards}  flushes ${m.flushes}`,
    `buffer ${m.bufferMs}ms  fps ${m.fps}  (média ${m.fpsAvg} fps / ${m.lossPctAvg}% perda)`,
  ].join('\n');
}

export function formatStatus(status: ServerStatus): string {
  const { ports } = status;
  const device = status.device
    ? `[${status.device.id}] ${status.device.name} · ${status.device.channels}ch` +
      (status.device.requested ? ` · pedido "${status.device.requested}"` : '')
    : red('nenhum (áudio indisponível)');

  const sessions =
    status.sessions.length === 0
      ? '0'
      : `${status.sessions.length} · ${status.sessions
          .map((s) => `${s.id} (${s.ip}, ${s.codec}, há ${formatShortDuration(Date.now() - s.connectedAt)})`)
          .join(', ')}`;

  return [
    `${bold(`micshare-pc ${status.version}`)} · pid ${status.pid} · uptime ${formatDuration(status.uptimeMs)}`,
    field('portas', `áudio ${ports.audio}/udp · controle ${ports.control}/ws · beacon ${ports.beacon}/udp`),
    field('endereços', status.addresses.length > 0 ? status.addresses.join(', ') : dim('sem rede')),
    field('device', device),
    field('codec', `${status.codec} · mute ${onOff(status.mute)} · volume ${status.volume.toFixed(2)}`),
    field('sessões', sessions),
    field(
      'áudio',
      `fps ${status.metrics.fps} · loss ${status.metrics.lossPct}% · buffer ${status.metrics.bufferMs}ms · ` +
        `gaps ${status.metrics.gaps} · underruns ${status.metrics.underruns}`
    ),
    field(
      'beacon',
      `${onOff(status.beacon.running)} (${status.beacon.intervalMs}ms) · ` +
        `pareamento ${status.beacon.pairingEnabled ? green('ligado') : dim('desligado')}`
    ),
  ].join('\n');
}

export function formatSessions(sessions: SessionInfo[]): string {
  if (sessions.length === 0) return dim('nenhuma sessão ativa');
  const now = Date.now();
  const rows = sessions.map((s) => [
    s.id,
    s.ip,
    s.codec,
    formatShortDuration(now - s.connectedAt),
    s.lastStatsAt ? `${formatShortDuration(now - s.lastStatsAt)} atrás` : '—',
  ]);
  const header = ['ID', 'IP', 'CODEC', 'CONECTADO HÁ', 'ÚLTIMO STATS'];
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i])).join('  ');
  return [dim(line(header)), ...rows.map((r) => line(r))].join('\n');
}

export function formatDevices(devices: DeviceInfo[], currentId?: number | null): string {
  if (devices.length === 0) return dim('nenhum dispositivo de saída encontrado');
  return devices
    .map((d) => {
      const marker = d.id === currentId ? green('*') : ' ';
      return `${marker} [${String(d.id).padStart(2)}] ${d.name} (${d.channels}ch)`;
    })
    .join('\n');
}

export function formatMute(mute: boolean): string {
  return `mute ${onOff(mute)}`;
}

export function formatVolume(volume: number): string {
  return `volume ${volume.toFixed(2)}`;
}
