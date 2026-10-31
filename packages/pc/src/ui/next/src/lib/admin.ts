// Cliente do canal administrativo do Micshare PC, rodando dentro do Next.js
// (Route Handlers têm acesso a node:net). Mesmo protocolo do CLI:
// named pipe \\.\pipe\micshare-pc-<USER> com fallback TCP 127.0.0.1:41237,
// JSON Lines + token de %LOCALAPPDATA%\Micshare\admin.token.
import { connect } from "node:net";
import { readFileSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";

export const ADMIN_TCP_PORT = 41237;

export interface AdminError {
  code: string;
  message: string;
}

export interface AdminResponse {
  id: number | string | null;
  ok: boolean;
  data?: unknown;
  error?: AdminError;
  stop?: boolean;
}

export class AdminUnavailableError extends Error {}

function adminTokenPath(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), "App", "Local");
  return join(base, "Micshare", "admin.token");
}

function adminPipePath(): string {
  const user = process.env.USERNAME ?? userInfo().username ?? "user";
  return `\\\\.\\pipe\\micshare-pc-${user.replace(/[^A-Za-z0-9_.-]/g, "_")}`;
}

/** Token do daemon ou null (nunca lança). */
export function readToken(): string | null {
  try {
    const token = readFileSync(adminTokenPath(), "utf8").trim();
    return token.length >= 32 ? token : null;
  } catch {
    return null;
  }
}

function connectOnce(target: string | number, timeoutMs: number): Promise<import("node:net").Socket> {
  return new Promise((resolve, reject) => {
    const socket =
      typeof target === "number" ? connect({ port: target, host: "127.0.0.1" }) : connect(target);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("timeout ao conectar"));
    }, timeoutMs);

    const onError = (err: Error) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    };

    socket.once("error", onError);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.removeListener("error", onError);
      resolve(socket);
    });
  });
}

async function connectAdmin(timeoutMs: number): Promise<import("node:net").Socket> {
  const errors: string[] = [];

  if (process.platform === "win32") {
    try {
      return await connectOnce(adminPipePath(), timeoutMs);
    } catch (err) {
      errors.push(`pipe: ${(err as Error).message}`);
    }
  }

  try {
    return await connectOnce(ADMIN_TCP_PORT, timeoutMs);
  } catch (err) {
    errors.push(`tcp: ${(err as Error).message}`);
  }

  throw new AdminUnavailableError(`servidor não está rodando (${errors.join("; ")})`);
}

/** Envia um comando ao daemon local e devolve a resposta. */
export async function adminRequest(
  cmd: string,
  args: string[] = [],
  timeoutMs = 3000
): Promise<AdminResponse> {
  const token = readToken();
  if (!token) {
    throw new AdminUnavailableError("token administrativo não encontrado (servidor nunca iniciou)");
  }

  const socket = await connectAdmin(timeoutMs);

  return new Promise<AdminResponse>((resolve, reject) => {
    let buffer = "";
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

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      const index = buffer.indexOf("\n");
      if (index < 0) return;

      const line = buffer.slice(0, index).trim();
      try {
        const response = JSON.parse(line) as AdminResponse;
        finish(() => resolve(response));
      } catch {
        finish(() => reject(new Error("resposta inválida do servidor")));
      }
    });

    socket.on("error", (err) => finish(() => reject(err)));
    socket.on("close", () => finish(() => reject(new Error("conexão encerrada sem resposta"))));

    socket.write(JSON.stringify({ id: 1, cmd, args, token }) + "\n");
  });
}

/** Ping rápido; true se o daemon respondeu. */
export async function isDaemonRunning(timeoutMs = 500): Promise<boolean> {
  try {
    const response = await adminRequest("ping", [], timeoutMs);
    return response.ok;
  } catch {
    return false;
  }
}
