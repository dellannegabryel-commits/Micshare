// REPL in-process (Fase 1): lê comandos do stdin e chama o registry direto.
import { createInterface } from 'node:readline';
import type { AudioServer } from '../audioServer.js';
import { CommandError, runCommand } from './commands.js';

export interface ReplOptions {
  json?: boolean;
  prompt?: string;
}

/**
 * Sobe o prompt. `stop`/`quit`/`exit`, Ctrl+C duas vezes ou EOF encerram o
 * servidor e o processo. Retorna quando o REPL termina.
 */
export async function startRepl(server: AudioServer, options: ReplOptions = {}): Promise<void> {
  const prompt = options.prompt ?? 'micshare> ';
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt,
    historySize: 200,
    terminal: Boolean(process.stdin.isTTY),
  });

  let stopping = false;
  let pending = false;

  const shutdown = async (code = 0): Promise<void> => {
    if (stopping) return;
    stopping = true;
    try {
      rl.close();
    } catch {
      // já fechado
    }
    await server.stop();
    process.exit(code);
  };

  const ctx = {
    server,
    json: options.json ?? false,
    out: (line: string) => process.stdout.write(`${line}\n`),
    err: (line: string) => process.stderr.write(`${line}\n`),
  };

  rl.prompt();

  rl.on('line', (line) => {
    if (pending) return;
    pending = true;
    void (async () => {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          const result = await runCommand(ctx, trimmed);
          if (result.stop) {
            await shutdown(0);
            return;
          }
        } catch (err) {
          if (err instanceof CommandError) ctx.err(err.message);
          else ctx.err(`erro: ${(err as Error).message}`);
        }
      }
      pending = false;
      if (!stopping) rl.prompt();
    })();
  });

  rl.on('SIGINT', () => {
    if (rl.line.length > 0) {
      // primeiro Ctrl+C limpa a linha; segundo encerra
      rl.write(null, { ctrl: true, name: 'u' });
      rl.prompt();
      return;
    }
    ctx.out('\n[micshare] encerrando...');
    void shutdown(0);
  });

  rl.on('close', () => {
    if (!stopping) void shutdown(0);
  });
}
