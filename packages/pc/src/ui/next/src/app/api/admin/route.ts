// Proxy HTTP → canal administrativo local. O browser nunca fala com o pipe:
// o Next.js (no mesmo host) traduz GET/POST em JSON-Lines autenticado.
import { NextRequest, NextResponse } from "next/server";
import { AdminUnavailableError, adminRequest, isDaemonRunning } from "@/lib/admin";

// Nota: `cacheComponents` está habilitado no next.config, então não usamos
// `export const runtime/dynamic` (incompatíveis). A rota é dinâmica por padrão
// porque lê `request` (nextUrl / json()) em cada chamada.

const ALLOWED_CMDS = new Set([
  "ping",
  "status",
  "stats",
  "clients",
  "sessions",
  "devices",
  "device",
  "mute",
  "volume",
  "disconnect",
  "restart",
  "pair",
  "beacon",
  "stop",
]);

/** GET /api/admin?cmd=status — comando sem argumentos (status, devices, ping...). */
export async function GET(request: NextRequest) {
  const cmd = request.nextUrl.searchParams.get("cmd") ?? "status";
  return execute(cmd, []);
}

/** POST /api/admin { cmd, args } — comando com argumentos (device, volume, mute...). */
export async function POST(request: NextRequest) {
  let body: { cmd?: unknown; args?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: { code: "bad_json", message: "corpo não é JSON válido" } }, { status: 400 });
  }

  const cmd = typeof body.cmd === "string" ? body.cmd : "";
  const args = Array.isArray(body.args) ? body.args.map((a) => String(a)) : [];
  return execute(cmd, args);
}

async function execute(cmd: string, args: string[]) {
  if (!cmd || !ALLOWED_CMDS.has(cmd)) {
    return NextResponse.json(
      { ok: false, error: { code: "bad_command", message: `comando não permitido: "${cmd}"` } },
      { status: 400 }
    );
  }

  try {
    const response = await adminRequest(cmd, args);
    // `stop` derruba o daemon; o cliente trata como sucesso especial.
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof AdminUnavailableError) {
      return NextResponse.json(
        { ok: false, error: { code: "not_running", message: "servidor não está rodando" } },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, error: { code: "error", message: (err as Error).message } },
      { status: 500 }
    );
  }
}

/** Head rápido para o badge de status. */
export async function HEAD() {
  const running = await isDaemonRunning(400);
  return new NextResponse(null, { status: running ? 200 : 503 });
}
