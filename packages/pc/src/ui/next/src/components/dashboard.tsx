"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiUnavailableError, apiGet, apiPost } from "@/lib/api";
import type { DeviceInfo, PairingInfo, ServerStatus, SessionInfo } from "@/lib/types";

/* ------------------------------------------------------------------ utils */

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatShortDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return `${m}m ${s}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** "192.168.0.5" → "192.168.5" (fica mais curto sem perder info). */
function shortIp(ip: string): string {
  return ip.replace(/^::ffff:/, "");
}

/* ------------------------------------------------------------ subcomponentes */

function Badge({ tone, children }: { tone: "ok" | "warn" | "off" | "err"; children: React.ReactNode }) {
  const color =
    tone === "ok" ? "var(--success)" : tone === "warn" ? "var(--warning)" : tone === "err" ? "var(--danger)" : "var(--muted)";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 truncate text-lg font-semibold" title={sub}>
        {value}
      </div>
      {sub && <div className="mt-0.5 truncate text-xs text-muted">{sub}</div>}
    </div>
  );
}

function ControlButton({
  onClick,
  disabled,
  tone = "default",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  children: React.ReactNode;
}) {
  const base =
    "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed";
  const styles =
    tone === "primary"
      ? "text-white"
      : tone === "danger"
        ? "border border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"
        : "border border-border text-foreground hover:bg-surface-2";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
      style={tone === "primary" ? { background: "var(--primary)" } : undefined}
    >
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- painéis */

function SessionsPanel({
  sessions,
  busy,
  onDisconnect,
}: {
  sessions: SessionInfo[];
  busy: string | null;
  onDisconnect: (id: string) => void;
}) {
  const [, forceTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (sessions.length === 0) {
    return (
      <div className="surface-card flex flex-col items-center justify-center gap-2 p-10 text-center">
        <div className="text-3xl">📴</div>
        <div className="font-medium">Nenhuma sessão ativa</div>
        <div className="max-w-sm text-sm text-muted">
          Conecte o celular ao mesmo Wi-Fi e abra o app Micshare. Ele aparecerá aqui automaticamente.
        </div>
      </div>
    );
  }

  return (
    <div className="surface-card divide-y divide-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3">
        <h3 className="text-sm font-semibold">{sessions.length} sessão(ões)</h3>
        <ControlButton
          tone="danger"
          disabled={busy !== null}
          onClick={() => onDisconnect("all")}
        >
          Desconectar todas
        </ControlButton>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-medium">ID</th>
              <th className="px-5 py-2 font-medium">IP</th>
              <th className="px-5 py-2 font-medium">Codec</th>
              <th className="px-5 py-2 font-medium">Conectado há</th>
              <th className="px-5 py-2 font-medium">Último stats</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((s) => (
              <tr key={s.id} className="hover:bg-surface-2">
                <td className="px-5 py-2.5 font-mono text-xs">{s.id}</td>
                <td className="px-5 py-2.5 font-mono">{shortIp(s.ip)}</td>
                <td className="px-5 py-2.5">
                  <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium uppercase">
                    {s.codec}
                  </span>
                </td>
                <td className="px-5 py-2.5 tabular-nums">{formatShortDuration(Date.now() - s.connectedAt)}</td>
                <td className="px-5 py-2.5 tabular-nums text-muted">
                  {s.lastStatsAt ? `${formatShortDuration(Date.now() - s.lastStatsAt)} atrás` : "—"}
                </td>
                <td className="px-5 py-2.5 text-right">
                  <ControlButton
                    tone="danger"
                    disabled={busy !== null}
                    onClick={() => onDisconnect(s.id)}
                  >
                    {busy === `disconnect:${s.id}` ? "…" : "Desconectar"}
                  </ControlButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DevicesPanel({
  devices,
  currentId,
  busy,
  onSelect,
}: {
  devices: DeviceInfo[];
  currentId: number | null;
  busy: string | null;
  onSelect: (name: string) => void;
}) {
  if (devices.length === 0) {
    return (
      <div className="surface-card p-8 text-center text-sm text-muted">
        Nenhum dispositivo de áudio encontrado.
      </div>
    );
  }

  return (
    <div className="surface-card divide-y divide-border overflow-hidden">
      {devices.map((d) => {
        const active = d.id === currentId;
        return (
          <button
            key={d.id}
            onClick={() => !active && onSelect(d.name)}
            disabled={active || busy !== null}
            className="flex w-full items-center justify-between px-5 py-3 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
          >
            <div className="flex items-center gap-3">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold"
                style={{
                  background: active ? "var(--primary)" : "var(--surface-2)",
                  color: active ? "#fff" : "var(--muted)",
                }}
              >
                {d.channels}ch
              </span>
              <div>
                <div className="text-sm font-medium">{d.name}</div>
                <div className="text-xs text-muted">[{d.id}] · {d.channels} canal(is)</div>
              </div>
            </div>
            {active ? <Badge tone="ok">ativo</Badge> : <span className="text-xs text-muted">usar</span>}
          </button>
        );
      })}
    </div>
  );
}

function VolumeControl({
  volume,
  mute,
  busy,
  onVolume,
  onMute,
}: {
  volume: number;
  mute: boolean;
  busy: string | null;
  onVolume: (v: number) => void;
  onMute: () => void;
}) {
  const [local, setLocal] = useState(volume);
  const committed = useRef(true);

  useEffect(() => {
    if (committed.current) setLocal(volume);
  }, [volume]);

  const commit = (value: number) => {
    setLocal(value);
    committed.current = false;
    onVolume(value);
    setTimeout(() => {
      committed.current = true;
    }, 300);
  };

  const pct = Math.round(local * 100);

  return (
    <div className="surface-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-semibold">Volume</span>
        <ControlButton onClick={onMute} disabled={busy !== null} tone={mute ? "danger" : "default"}>
          {mute ? "🔇 Desmutar" : "🔊 Mutar"}
        </ControlButton>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={4}
          step={0.05}
          value={local}
          onChange={(e) => commit(Number(e.target.value))}
          disabled={busy !== null}
          className="micshare-range h-2 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ background: `linear-gradient(to right, var(--primary) ${pct / 4}%, var(--surface-2) ${pct / 4}%)` }}
        />
        <span className="w-14 text-right text-sm font-medium tabular-nums">{pct}%</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-muted">
        <span>0%</span>
        <span>100%</span>
        <span>400%</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- dashboard */

type BusyKind = string | null;

export function Dashboard() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [running, setRunning] = useState<boolean | null>(null); // null = desconhecido
  const [busy, setBusy] = useState<BusyKind>(null);
  const [toast, setToast] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  const showToast = useCallback((text: string, tone: "ok" | "err" = "ok") => {
    setToast({ text, tone });
    setTimeout(() => setToast(null), 2500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await apiGet<ServerStatus>("status");
      if (result.ok && result.data) {
        setStatus(result.data);
        setRunning(true);
      } else {
        setRunning(false);
        setStatus(null);
      }
    } catch (err) {
      setRunning(err instanceof ApiUnavailableError ? false : null);
      if (!(err instanceof ApiUnavailableError)) setStatus(null);
    }
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const result = await apiGet<DeviceInfo[]>("devices");
      if (result.ok && Array.isArray(result.data)) setDevices(result.data);
    } catch {
      /* daemon parado: mantém lista anterior */
    }
  }, []);

  const refreshPairing = useCallback(async () => {
    try {
      const result = await apiPost<PairingInfo>("pair", []);
      if (result.ok && result.data) setPairing(result.data);
    } catch {
      /* daemon parado: mantém anterior */
    }
  }, []);

  // polling: status 2s, devices 10s, pair 10s
  useEffect(() => {
    void refresh();
    void refreshDevices();
    void refreshPairing();
    const statusTimer = setInterval(() => void refresh(), 2000);
    const slowTimer = setInterval(() => {
      void refreshDevices();
      void refreshPairing();
    }, 10000);
    return () => {
      clearInterval(statusTimer);
      clearInterval(slowTimer);
    };
  }, [refresh, refreshDevices, refreshPairing]);

  const run = useCallback(
    async (label: string, cmd: string, args: string[] = []) => {
      setBusy(label);
      try {
        const result = await apiPost(cmd, args);
        if (result.ok) {
          if (cmd === "stop") {
            showToast("Servidor encerrando…");
            setTimeout(() => void refresh(), 800);
          } else {
            showToast("OK");
          }
          await refresh();
          if (cmd === "device" || cmd === "restart") await refreshDevices();
          if (cmd === "pair" || cmd === "beacon") await refreshPairing();
        } else {
          showToast(result.error?.message ?? "erro", "err");
        }
      } catch (err) {
        showToast((err as Error).message, "err");
      } finally {
        setBusy(null);
      }
    },
    [refresh, refreshDevices, refreshPairing, showToast]
  );

  /* ---------------------------------------------------------- estado parado */

  if (running === false) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="surface-card flex h-20 w-20 items-center justify-center text-4xl">⏸️</div>
        <h1 className="text-2xl font-semibold">Servidor parado</h1>
        <p className="max-w-md text-sm text-muted">
          O daemon do Micshare PC não está em execução. Inicie pelo terminal para
          controlar áudio, dispositivos e sessões por aqui.
        </p>
        <code className="rounded-lg bg-surface-2 px-4 py-2 font-mono text-sm">
          micshare-pc daemon start
        </code>
        <button
          onClick={() => {
            void refresh();
            void refreshDevices();
          }}
          className="mt-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ background: "var(--primary)" }}
        >
          Verificar novamente
        </button>
      </div>
    );
  }

  const s = status;

  return (
    <div className="relative flex flex-col gap-6">
      {/* toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2 text-sm font-medium text-white shadow-lg"
          style={{ background: toast.tone === "ok" ? "var(--success)" : "var(--danger)" }}
        >
          {toast.text}
        </div>
      )}

      {/* header de status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Controle</h1>
          <p className="text-sm text-muted">
            {s
              ? `micshare-pc ${s.version} · pid ${s.pid} · uptime ${formatDuration(s.uptimeMs)}`
              : "consultando o servidor…"}
          </p>
        </div>
        <Badge tone={running === true ? "ok" : "off"}>{running === true ? "online" : "offline"}</Badge>
      </div>

      {/* cards de status */}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Dispositivo"
              value={s.device ? s.device.name : "nenhum"}
              sub={s.device ? `[${s.device.id}] · ${s.device.channels}ch` : "áudio indisponível"}
            />
            <StatCard label="Codec" value={s.codec.toUpperCase()} sub={`mute ${s.mute ? "on" : "off"} · vol ${Math.round(s.volume * 100)}%`} />
            <StatCard
              label="Sessões"
              value={s.sessions.length}
              sub={s.sessions.length > 0 ? s.sessions.map((x) => shortIp(x.ip)).join(", ") : "aguardando celular"}
            />
            <StatCard
              label="Áudio"
              value={`${s.metrics.fps} fps`}
              sub={`loss ${s.metrics.lossPct}% · buffer ${s.metrics.bufferMs}ms`}
            />
          </div>

          {/* endereços + portas */}
          <div className="surface-card flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 text-sm">
            <span className="text-muted">Endereços:</span>
            {s.addresses.length > 0 ? (
              s.addresses.map((a) => (
                <span key={a} className="rounded bg-surface-2 px-2 py-0.5 font-mono text-xs">
                  {a}
                </span>
              ))
            ) : (
              <span className="text-muted">sem rede</span>
            )}
            <span className="ml-auto text-xs text-muted">
              áudio {s.ports.audio}/udp · controle {s.ports.control}/ws · beacon {s.ports.beacon}/udp
            </span>
          </div>

          {/* sessões */}
          <SessionsPanel
            sessions={s.sessions}
            busy={busy}
            onDisconnect={(id) => void run(`disconnect:${id}`, "disconnect", [id])}
          />

          {/* volume + dispositivos */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-6">
              <VolumeControl
                volume={s.volume}
                mute={s.mute}
                busy={busy}
                onVolume={(v) => void run("volume", "volume", [v.toFixed(2)])}
                onMute={() => void run("mute", "mute")}
              />

              {/* beacon + pareamento */}
              <div className="surface-card p-5">
                <div className="mb-3 text-sm font-semibold">Descoberta &amp; pareamento</div>
                <div className="flex flex-wrap items-center gap-2">
                  <ControlButton
                    disabled={busy !== null}
                    onClick={() => void run("beacon", "beacon", [s.beacon.running ? "off" : "on"])}
                  >
                    Beacon {s.beacon.running ? "off" : "on"}
                  </ControlButton>
                  <ControlButton
                    disabled={busy !== null}
                    onClick={() => void run("pair", "pair", [pairing?.enabled ? "off" : "on"])}
                  >
                    Pareamento {pairing?.enabled ? "off" : "on"}
                  </ControlButton>
                  {pairing?.enabled && (
                    <ControlButton disabled={busy !== null} onClick={() => void run("pair", "pair", ["rotate"])}>
                      Rotar código
                    </ControlButton>
                  )}
                </div>
                {pairing?.enabled && pairing.code && (
                  <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
                    <span className="text-muted">Código: </span>
                    <span className="font-mono font-semibold tracking-widest" style={{ color: "var(--primary)" }}>
                      {pairing.code}
                    </span>
                  </div>
                )}
              </div>

              {/* restart */}
              <div className="surface-card p-5">
                <div className="mb-1 text-sm font-semibold">Reiniciar componentes</div>
                <p className="mb-3 text-xs text-muted">Reinicia parte do servidor sem matar o processo.</p>
                <div className="flex flex-wrap gap-2">
                  <ControlButton disabled={busy !== null} onClick={() => void run("restart:sink", "restart", ["--sink"])}>
                    Sink
                  </ControlButton>
                  <ControlButton disabled={busy !== null} onClick={() => void run("restart:control", "restart", ["--control"])}>
                    Controle
                  </ControlButton>
                  <ControlButton disabled={busy !== null} onClick={() => void run("restart:beacon", "restart", ["--beacon"])}>
                    Beacon
                  </ControlButton>
                  <ControlButton
                    tone="danger"
                    disabled={busy !== null}
                    onClick={() => void run("restart:all", "restart", ["--all"])}
                  >
                    Tudo
                  </ControlButton>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Dispositivos de saída</h3>
                <DevicesPanel
                  devices={devices}
                  currentId={s.device?.id ?? null}
                  busy={busy}
                  onSelect={(name) => void run("device", "device", [name])}
                />
              </div>

              {/* zona de perigo */}
              <div
                className="rounded-2xl border p-5"
                style={{ borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)" }}
              >
                <div className="mb-1 text-sm font-semibold" style={{ color: "var(--danger)" }}>
                  Zona de perigo
                </div>
                <p className="mb-3 text-xs text-muted">Encerra o daemon. A UI voltará a mostrar “servidor parado”.</p>
                <ControlButton
                  tone="danger"
                  disabled={busy !== null}
                  onClick={() => {
                    if (window.confirm("Encerrar o servidor Micshare PC?")) {
                      void run("stop", "stop");
                    }
                  }}
                >
                  Encerrar servidor
                </ControlButton>
              </div>
            </div>
          </div>
        </>
      )}

      {!s && running !== false && (
        <div className="surface-card flex items-center justify-center p-16 text-sm text-muted">
          Conectando ao daemon…
        </div>
      )}

      {/* estilos do slider (global puro — sem styled-jsx) */}
      <style>{`
        .micshare-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #fff;
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }
        .micshare-range::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #fff;
          border: 1px solid var(--border);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
