import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { ServerConfig, ServerStats, AudioDevice, LogEntry, DiscoveryStatus } from '../types';

export function useServer() {
  const [config, setConfig] = useState<ServerConfig>({
    audioPort: 41235,
    ctrlPort: 41236,
    deviceSubstring: null,
    name: null,
    defaultCodec: 'opus',
  });

  const [stats, setStats] = useState<ServerStats>({
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
  });

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<DiscoveryStatus | null>(null);

  // Load initial config and devices
  useEffect(() => {
    loadConfig();
    loadDevices();
    loadDiscovery();
  }, []);

  // Listen for stats updates from backend
  useEffect(() => {
    let unlisten: UnlistenFn;

    const setupListener = async () => {
      unlisten = await listen<ServerStats>('server-stats', (event) => {
        setStats(event.payload);
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Poll stats when server is running
  useEffect(() => {
    if (!stats.running) return;

    const interval = setInterval(async () => {
      try {
        const currentStats = await invoke<ServerStats>('get_server_stats');
        setStats(currentStats);
      } catch (e) {
        console.error('Failed to fetch stats:', e);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [stats.running]);

  const loadConfig = useCallback(async () => {
    try {
      const loadedConfig = await invoke<ServerConfig>('get_server_config');
      setConfig(loadedConfig);
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }, []);

  const loadDevices = useCallback(async () => {
    try {
      const deviceNames = await invoke<string[]>('list_output_devices');
      setDevices(deviceNames.map(name => ({ name, isDefault: false })));
    } catch (e) {
      console.error('Failed to load devices:', e);
    }
  }, []);

  const loadDiscovery = useCallback(async () => {
    try {
      const status = await invoke<DiscoveryStatus | null>('get_discovery_status');
      setDiscovery(status);
    } catch (e) {
      console.error('Failed to load discovery status:', e);
    }
  }, []);

  const startDiscovery = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await invoke<DiscoveryStatus>('start_discovery');
      setDiscovery(status);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start discovery');
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
      setError(e instanceof Error ? e.message : 'Failed to stop discovery');
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

  const startServer = useCallback(async (newConfig?: Partial<ServerConfig>) => {
    setLoading(true);
    setError(null);

    try {
      const finalConfig = { ...config, ...newConfig };
      await invoke('start_server', { config: finalConfig });
      setConfig(finalConfig);
      await invoke('save_server_config', { config: finalConfig });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start server');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [config]);

  const stopServer = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await invoke('stop_server');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to stop server');
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConfig = useCallback(async (updates: Partial<ServerConfig>) => {
    const newConfig = { ...config, ...updates };
    setConfig(newConfig);
    await invoke('save_server_config', { config: newConfig });
  }, [config]);

  const installVBCable = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await invoke('install_vbcable');
      await loadDevices();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to install VB-Cable');
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadDevices]);

  const openLogFolder = useCallback(async () => {
    try {
      await invoke('open_log_folder');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open log folder');
    }
  }, []);

  const addLog = useCallback((level: LogEntry['level'], message: string) => {
    setLogs(prev => [...prev.slice(-999), {
      id: Date.now(),
      timestamp: new Date(),
      level,
      message,
    }]);
  }, []);

  return {
    config,
    stats,
    devices,
    logs,
    loading,
    error,
    discovery,
    startServer,
    stopServer,
    updateConfig,
    installVBCable,
    openLogFolder,
    addLog,
    refreshDevices: loadDevices,
    loadDiscovery,
    startDiscovery,
    stopDiscovery,
    setDiscoveryEnabled,
  };
}