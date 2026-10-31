// Cliente HTTP da API admin (browser). Espelha o contrato de /api/admin.
import type { AdminError } from "./admin";

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: AdminError;
  stop?: boolean;
}

export class ApiUnavailableError extends Error {}

async function parseOrThrow(response: Response): Promise<ApiResult> {
  const body = (await response.json().catch(() => null)) as ApiResult | null;
  if (!body) throw new Error("resposta inválida do servidor");

  if (response.status === 503) {
    throw new ApiUnavailableError(body.error?.message ?? "servidor não está rodando");
  }
  return body;
}

/** GET /api/admin?cmd=... */
export async function apiGet<T>(cmd: string): Promise<ApiResult<T>> {
  const response = await fetch(`/api/admin?cmd=${encodeURIComponent(cmd)}`, { cache: "no-store" });
  return parseOrThrow(response) as ApiResult<T>;
}

/** POST /api/admin { cmd, args } */
export async function apiPost<T>(cmd: string, args: string[] = []): Promise<ApiResult<T>> {
  const response = await fetch("/api/admin", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
  });
  return parseOrThrow(response) as ApiResult<T>;
}
