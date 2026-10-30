// Parsing de linha de comando do REPL. Separado do registry para ser testável
// sem subir servidor nem tocar em áudio.

export interface ParsedLine {
  command: string;
  args: string[];
}

/** Quebra uma linha em tokens respeitando aspas simples/duplas e `\`. */
export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let hasToken = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote) {
      if (ch === '\\' && quote === '"' && i + 1 < input.length) {
        current += input[++i];
        hasToken = true;
      } else if (ch === quote) {
        quote = null;
      } else {
        current += ch;
        hasToken = true;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }

    if (/\s/.test(ch)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }

    if (ch === '\\' && i + 1 < input.length) {
      current += input[++i];
      hasToken = true;
      continue;
    }

    current += ch;
    hasToken = true;
  }

  if (quote) throw new Error('aspas não fechadas na linha');
  if (hasToken) tokens.push(current);
  return tokens;
}

/** `status --json` → `{ command: 'status', args: ['--json'] }`; vazio → null. */
export function parseLine(input: string): ParsedLine | null {
  const tokens = tokenize(input);
  if (tokens.length === 0) return null;
  const [command, ...args] = tokens;
  return { command: command.toLowerCase(), args };
}

export type MuteArg = 'on' | 'off' | 'toggle';

export function parseMuteArg(arg: string | undefined): MuteArg {
  if (!arg) return 'toggle';
  const v = arg.toLowerCase();
  if (v === 'on' || v === 'true' || v === '1') return 'on';
  if (v === 'off' || v === 'false' || v === '0') return 'off';
  if (v === 'toggle') return 'toggle';
  throw new Error(`valor inválido para mute: "${arg}" (use on, off ou toggle)`);
}

const VOLUME_MIN = 0;
const VOLUME_MAX = 4;

/**
 * Aceita valor absoluto (`2`, `1.5`) ou relativo (`+0.1`, `-0.5`).
 * O resultado é sempre clampado em [0, 4].
 */
export function parseVolumeArg(arg: string, current: number): number {
  const raw = arg.trim();
  if (raw === '') throw new Error('volume precisa de um valor (ex: 1.5, +0.1, -0.1)');

  const isRelative = raw.startsWith('+') || raw.startsWith('-');
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`valor inválido para volume: "${arg}"`);

  const next = isRelative ? current + value : value;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(next * 100) / 100));
}

export type ParsedRestartScope = 'sink' | 'control' | 'beacon' | 'all';

/** `restart --sink` → sink; sem flags → all. */
export function parseRestartScope(args: string[]): ParsedRestartScope {
  const scopes = new Set<ParsedRestartScope>();
  for (const arg of args) {
    switch (arg) {
      case '--sink':
        scopes.add('sink');
        break;
      case '--control':
      case '--ws':
        scopes.add('control');
        break;
      case '--beacon':
        scopes.add('beacon');
        break;
      case '--all':
        scopes.add('all');
        break;
      default:
        throw new Error(`argumento inválido para restart: "${arg}" (use --sink, --control, --beacon ou --all)`);
    }
  }

  if (scopes.size === 0) return 'all';
  if (scopes.has('all') || scopes.size > 1) return 'all';
  return [...scopes][0];
}

/** Código de pareamento de 6 dígitos. */
export function generatePairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
