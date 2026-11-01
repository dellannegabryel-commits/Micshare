import { RefreshCw, Speaker, Mic, Download } from 'lucide-react';

interface DeviceSelectorProps {
  devices: Array<{ name: string; isDefault: boolean; isVirtualCable: boolean }>;
  selectedDevice: string | null;
  activeDevice: string;
  onChange: (name: string | null) => void;
  onRefresh: () => void;
  onInstallVBCable: () => void;
  installing: boolean;
}

export function DeviceSelector({
  devices,
  selectedDevice,
  activeDevice,
  onChange,
  onRefresh,
  onInstallVBCable,
  installing,
}: DeviceSelectorProps) {
  const hasVirtualCable = devices.some(d => d.isVirtualCable);
  const activeIsCable = devices.some(d => d.name === activeDevice && d.isVirtualCable);

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <Speaker className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          Dispositivo de Áudio
        </h2>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          aria-label="Atualizar dispositivos"
        >
          <RefreshCw className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        </button>
      </div>

      <select
        value={selectedDevice || ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="input-select"
      >
        <option value="">Automático (cabo virtual, se houver)</option>
        {devices.map((device) => (
          <option key={device.name} value={device.name}>
            {device.name}
            {device.isVirtualCable ? ' — microfone virtual' : ''}
            {device.isDefault ? ' (padrão)' : ''}
          </option>
        ))}
      </select>

      {devices.length === 0 && (
        <p className="text-sm text-center text-neutral-500 dark:text-neutral-400 mt-2 py-4">
          Nenhum dispositivo de saída encontrado
        </p>
      )}

      {/* Estado real: para onde o áudio está sendo enviado agora */}
      <div className={`mt-3 p-3 rounded-xl text-xs flex items-start gap-2 ${
        activeIsCable
          ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200'
          : 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200'
      }`}>
        <Mic className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          {activeDevice ? (
            <>
              <p className="font-medium">
                Saída ativa: <span className="font-mono break-all">{activeDevice}</span>
              </p>
              {activeIsCable ? (
                <p className="mt-0.5">
                  No Discord/OBS, selecione <strong>CABLE Output</strong> como microfone.
                </p>
              ) : (
                <p className="mt-0.5">
                  Este dispositivo não vira microfone. Selecione um cabo virtual acima.
                </p>
              )}
            </>
          ) : (
            <p className="font-medium">Nenhum dispositivo de saída ativo.</p>
          )}
        </div>
      </div>

      {!hasVirtualCable && (
        <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-xl text-xs flex items-start gap-2 text-yellow-800 dark:text-yellow-200">
          <Download className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="font-medium">Nenhum cabo virtual detectado</p>
            <p className="mt-0.5">
              Sem o VB-Cable o áudio não pode ser capturado como microfone por
              Discord, OBS ou Zoom.
            </p>
            <button
              onClick={onInstallVBCable}
              disabled={installing}
              className="mt-2 font-medium underline disabled:opacity-50"
            >
              {installing ? 'Abrindo...' : 'Instalar VB-Cable'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
