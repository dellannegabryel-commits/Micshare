import { ServerStatus } from './components/ServerStatus';
import { DeviceSelector } from './components/DeviceSelector';
import { ControlsPanel } from './components/ControlsPanel';
import { StatsPanel } from './components/StatsPanel';
import { LogConsole } from './components/LogConsole';
import { useServer } from './hooks/useServer';
import { Mic, Settings, AlertTriangle, Loader2, XCircle } from 'lucide-react';

function App() {
  const {
    config,
    stats,
    devices,
    logs,
    loading,
    error,
    discovery,
    running,
    startServer,
    stopServer,
    updateConfig,
    installVBCable,
    openLogFolder,
    refreshDevices,
    setMute,
    setVolume,
    setActiveSink,
    clearLogs,
  } = useServer();

  const isVBCableInstalled = devices.some(d =>
    d.name.toLowerCase().includes('cable') || d.name.toLowerCase().includes('vb-audio')
  );

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 border-b border-neutral-200/50 dark:border-neutral-700/50 backdrop-blur-lg bg-white/80 dark:bg-neutral-900/80 sticky top-0 z-10">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500 flex items-center justify-center">
              <Mic className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">Micshare</h1>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">PC Microphone Server</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openLogFolder}
              className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
              title="Open logs folder"
            >
              <Settings className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <div className="max-w-md mx-auto space-y-4">

          {/* Structured error banner */}
          {error && (
            <div className="glass-panel p-4 flex items-start gap-3 border-red-200/50 dark:border-red-700/50 bg-red-50/50 dark:bg-red-900/20">
              <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-800 dark:text-red-200">
                  Erro ao iniciar o servidor
                  <span className="ml-2 font-mono text-xs px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                    {error.code}
                  </span>
                </p>
                <p className="text-xs text-red-700 dark:text-red-300 mt-1 break-words">
                  {error.message}
                </p>
              </div>
            </div>
          )}

          {/* VB-Cable Warning */}
          {!isVBCableInstalled && (
            <div className="glass-panel p-4 flex items-start gap-3 border-yellow-200/50 dark:border-yellow-700/50 bg-yellow-50/50 dark:bg-yellow-900/20">
              <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">VB-Cable não detectado</p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                  O Discord/OBS não verão o microfone. Instale o driver virtual para rotear o áudio.
                </p>
                <button
                  onClick={installVBCable}
                  disabled={loading}
                  className="mt-2 text-xs font-medium text-yellow-700 dark:text-yellow-300 hover:underline flex items-center gap-1"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Instalar VB-Cable
                </button>
              </div>
            </div>
          )}

          {/* Server Status Card */}
          <ServerStatus
            running={running}
            sessions={stats.sessions}
            deviceName={stats.deviceName}
            onStart={startServer}
            onStop={stopServer}
            loading={loading}
            discovery={discovery}
          />

          {/* Device Selector */}
          <DeviceSelector
            devices={devices}
            selectedDevice={config.deviceSubstring}
            onChange={(name) => {
              updateConfig({ deviceSubstring: name || null });
              // Hot-swap: troca o stream ativo sem reiniciar o servidor.
              setActiveSink(name || null).catch(() => {
                // Erro já registrado em `error`/logs pelo hook.
              });
            }}
            onRefresh={refreshDevices}
          />

          {/* Controls Panel */}
          <ControlsPanel
            muted={stats.muted}
            volume={stats.volume / 1000}
            onMuteChange={setMute}
            onVolumeChange={(v) => setVolume(Math.round(v * 1000))}
          />

          {/* Stats Panel */}
          <StatsPanel stats={stats} />

          {/* Log Console */}
          <LogConsole logs={logs} onClear={clearLogs} />

        </div>
      </main>

      {/* Footer */}
      <footer className="px-6 py-4 border-t border-neutral-200/50 dark:border-neutral-700/50 bg-white/50 dark:bg-neutral-900/50">
        <div className="max-w-md mx-auto flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <span>Micshare v0.1.0</span>
          <span>Latência alvo: {"<"} 150ms</span>
        </div>
      </footer>
    </div>
  );
}

export default App;