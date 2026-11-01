import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  ServerConfig,
  ServerStats,
  AudioDevice,
  LogEntry,
  DiscoveryStatus,
  CommandError,
  StatusEvent,
} from '../types';

const EMPTY_STATS: ServerStats = {
  running: false,
  sessions: 0,
  jitter: {
    received: 0,
    lost: 0,
    gaps: 0,
    bufferMs: 0,
    underruns: 0,
    fastForwards: 0,
    flushes: 0,
  },
  fps: 0,
  lossPct: 0,
  deviceName: '',
  muted: false,
  volume: 1000,
  reconnects: 0,
};

const DEFAULT_CONFIG: ServerConfig = {
  audioPort: 41235,
  ctrlPort: 41236,
  deviceSubstring: null,
  name: null,
  defaultCodec: 'opus',
};

/**
 * Normaliza o erro vindo do `invoke`. O Tauri serializa `Result<T, CommandError>`
 * como um objeto `{ code, message }` (não uma `Error`), então precisamos tratar
 * ambos os formatos.
 */
function toCommandError(e: unknown, fallback: string): CommandError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    return e as CommandError;
  }
  return {
    code: 'unknown',
    message: e instanceof Error ? e.message : fallback,
  };
}

/**
 * Converte o argumento de `startServer` em um patch de config válido.
 *
 * Se o handler for usado como `onClick={startServer}`, o React injeta o evento
 * de clique (um objeto circular com referências ao DOM). Espalhar isso na config
 * faz o `JSON.stringify` do `invoke` lançar "Converting circular structure".
 * Aqui só aceitamos objetos planos — qualquer outra coisa vira `{}`.
 */
function toConfigPatch(v: unknown): Partial<ServerConfig> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    return {};
  }
  const proto = Object.getPrototypeOf(v);
  // Só objetos literais (`{}`) — rejeita eventos e elementos DOM.
  if (proto !== Object.prototype && proto !== null) {
    return {};
  }
  return v as Partial<ServerConfig>;
}

export function useServer() {
  const [config, setConfig] = useState<ServerConfig>(DEFAULT_CONFIG);
  const [stats, setStats] = useState<ServerStats>(EMPTY_STATS);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CommandError | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);
  const [running, setRunning] = useState(false);
  const [version, setVersion] = useState('');

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev.slice(-999), {
      id: Date.now(),
      timestamp: new Date(),
      level,
      message,
    }]);
  }, []);

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // Carrega config, dispositivos e status; inicia o servidor automaticamente.
  useEffect(() => {
    const boot = async () => {
      let loaded = DEFAULT_CONFIG;
      try {
        loaded = await invoke<ServerConfig>('get_server_config');
        setConfig(loaded);
      } catch (e) {
        console.error('Failed to load config:', e);
      }

      try {
        const list = await invoke<AudioDevice[]>('list_output_devices');
        setDevices(list);
      } catch (e) {
        console.error('Failed to load devices:', e);
      }

      try {
        const status = await invoke<StatusEvent>('get_server_status');
        setRunning(status.running);
        setError(status.error);
      } catch (e) {
        console.error('Failed to load status:', e);
      }

      // Estado do beacon (a pílula "Beacon" na UI).
      try {
        const beacon = await invoke<DiscoveryStatus | null>('get_discovery_status');
        setDiscovery(beacon);
      } catch (e) {
        console.error('Failed to load discovery:', e);
      }

      // Versão real do binário (vem do tauri.conf.json no build).
      try {
        setVersion(await getVersion());
      } catch (e) {
        console.error('Failed to load version:', e);
      }
    };

    boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Escuta os eventos de status e stats emitidos pelo backend.
  useEffect(() => {
    const unlisteners: UnlistenFn[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen<StatusEvent>('server-status', (event) => {
          setRunning(event.payload.running);
          setError(event.payload.error);
        })
      );
      unlisteners.push(
        await listen<ServerStats>('server-stats', (event) => {
          setStats(event.payload);
        })
      );
    };

    setup();

    return () => {
      unlisteners.forEach((u) => u());
    };
  }, []);

  const loadDiscovery = useCallback(async () => {
    try {
      const status = await invoke<DiscoveryStatus | null>('get_discovery_status');
      setDiscovery(status);
    } catch (e) {
      console.error('Failed to load discovery status:', e);
    }
  }, []);

  // Poll de sessões (o backend já emite `server-stats`, mas mantemos fallback).
  // Atualiza também o beacon para a pílula "Beacon" refletir o estado real.
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(async () => {
      try {
        const current = await invoke<ServerStats>('get_server_stats');
        setStats(current);
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
      try {
        const beacon = await invoke<DiscoveryStatus | null>('get_discovery_status');
        setDiscovery(beacon);
      } catch (e) {
        console.error('Failed to fetch discovery:', e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [running]);

  const startServer = useCallback(async (newConfig?: Partial<ServerConfig>) => {
    setLoading(true);
    setError(null);

    try {
      // Guarda: se vier um evento (handler usado como onClick), vira `{}`.
      const finalConfig = { ...config, ...toConfigPatch(newConfig) };
      await invoke('start_server', { config: finalConfig });
      setConfig(finalConfig);
      await invoke('save_server_config', { config: finalConfig });
      addLog('info', 'Servidor iniciado.');
    } catch (e) {
      const err = toCommandError(e, 'Falha ao iniciar o servidor');
      setError(err);
      setRunning(false);
      addLog('error', `[${err.code}] ${err.message}`);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [config, addLog]);

  const stopServer = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await invoke('stop_server');
      setRunning(false);
      setStats(EMPTY_STATS);
      setDiscovery(null);
      addLog('info', 'Servidor parado.');
    } catch (e) {
      const err = toCommandError(e, 'Falha ao parar o servidor');
      setError(err);
      addLog('error', `[${err.code}] ${err.message}`);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [addLog]);

  const updateConfig = useCallback(async (updates: Partial<ServerConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    await invoke('save_server_config', { config: newConfig });
  }, [config]);

  const startDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await invoke<DiscoveryStatus>('start_discovery');
      setDiscovery(status);
    } catch (e) {
      const err = toCommandError(e, 'Falha ao iniciar descoberta');
      setError(err);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const stopDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await invoke('stop_discovery');
      setDiscovery(null);
    } catch (e) {
      const err = toCommandError(e, 'Falha ao parar descoberta');
      setError(err);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const setDiscoveryEnabled = useCallback(async (enabled: boolean) => {
    try {
      await invoke('set_discovery_enabled', { enabled });
      setDiscovery(prev => (prev ? { ...prev, enabled } : prev));
    } catch (e) {
      console.error('Failed to toggle discovery:', e);
    }
  }, []);

  /**
   * Abre o VB-Cable no navegador.
   * `direct` baixa o pacote do driver; sem ele, abre a página oficial.
   */
  const installVBCable = useCallback(async (direct = true) => {
    setLoading(true);
    setError(null);
    try {
      await invoke('install_vbcable', { direct });
    } catch (e) {
      const err = toCommandError(e, 'Falha ao abrir página do VB-Cable');
      setError(err);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const openLogFolder = useCallback(async () => {
    try {
      await invoke('open_log_folder');
    } catch (e) {
      setError(toCommandError(e, 'Falha ao abrir pasta de logs'));
    }
  }, []);

  const setMute = useCallback(async (muted: boolean) => {
    try {
      await invoke('set_mute', { muted });
      // Atualização otimista; o próximo `server-stats` confirma.
      setStats(prev => ({ ...prev, muted }));
      addLog('info', muted ? 'Reprodução mutada no PC.' : 'Reprodução desmutada no PC.');
    } catch (e) {
      setError(toCommandError(e, 'Falha ao alterar o mute'));
    }
  }, [addLog]);

  const setVolume = useCallback(async (volume: number) => {
    // Fixed-point: 0..=4000 (1000 = 100%).
    const fixed = Math.max(0, Math.min(4000, Math.round(volume)));
    try {
      await invoke('set_volume', { volume: fixed });
      setStats(prev => ({ ...prev, volume: fixed }));
    } catch (e) {
      setError(toCommandError(e, 'Falha ao alterar o volume'));
    }
  }, []);

  /**
   * Troca o dispositivo de saída em quente (hot-swap no backend).
   * `null` volta ao dispositivo padrão do sistema.
   */
  const setActiveSink = useCallback(async (deviceName: string | null) => {
    try {
      const opened = await invoke<string>('set_active_sink', { deviceName });
      setStats(prev => ({ ...prev, deviceName: opened }));
      addLog('info', `Saída de áudio trocada para: ${opened}`);
    } catch (e) {
      const err = toCommandError(e, 'Falha ao trocar o dispositivo de saída');
      setError(err);
      addLog('error', `[${err.code}] ${err.message}`);
      throw e;
    }
  }, [addLog]);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await invoke<AudioDevice[]>('list_output_devices');
      setDevices(list);
    } catch (e) {
      console.error('Failed to refresh devices:', e);
    }
  }, []);

  return {
    config,
    stats,
    devices,
    logs,
    loading,
    error,
    discovery,
    running,
    version,
    startServer,
    stopServer,
    updateConfig,
    installVBCable,
    openLogFolder,
    addLog,
    refreshDevices,
    loadDiscovery,
    startDiscovery,
    stopDiscovery,
    setDiscoveryEnabled,
    setMute,
    setVolume,
    setActiveSink,
    clearLogs,
  };
}
