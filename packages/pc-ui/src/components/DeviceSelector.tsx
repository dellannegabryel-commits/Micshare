import { RefreshCw, Speaker } from 'lucide-react';

interface DeviceSelectorProps {
  devices: Array<{ name: string; isDefault: boolean }>;
  selectedDevice: string | null;
  onChange: (name: string | null) => void;
  onRefresh: () => void;
}

export function DeviceSelector({ devices, selectedDevice, onChange, onRefresh }: DeviceSelectorProps) {
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
        <option value="">Dispositivo padrão do sistema</option>
        {devices.map((device) => (
          <option key={device.name} value={device.name}>
            {device.name} {device.isDefault && '(padrão)'}
          </option>
        ))}
      </select>

      {devices.length === 0 && (
        <p className="text-sm text-center text-neutral-500 dark:text-neutral-400 mt-2 py-4">
          Nenhum dispositivo de saída encontrado
        </p>
      )}

      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 text-center">
        Selecione "CABLE Input" ou "VB-Audio" para uso com Discord/OBS
      </p>
    </div>
  );
}