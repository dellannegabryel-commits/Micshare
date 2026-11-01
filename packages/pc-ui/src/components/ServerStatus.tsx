import { Cpu, Loader2 } from 'lucide-react';
import { DiscoveryStatus } from '../types';

interface ServerStatusProps {
  running: boolean;
  sessions: number;
  deviceName: string;
  onStart: () => void;
  onStop: () => void;
  loading: boolean;
  discovery: DiscoveryStatus | null;
}

export function ServerStatus({ running, sessions, deviceName, onStart, onStop, loading, discovery }: ServerStatusProps) {
  return (
    <div className="glass-panel-elevated p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">Status do Servidor</h2>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${
          running ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
        }`}>
          <span className={`w-2 h-2 rounded-full ${running ? 'bg-green-500' : 'bg-neutral-400'}`} />
          <span className="text-sm font-medium">{running ? 'Rodando' : 'Parado'}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="stat-pill text-center">
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{sessions}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Clientes</div>
        </div>
        <div className="stat-pill text-center">
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">{running ? '🟢' : '🔴'}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Conexão</div>
        </div>
        <div className="stat-pill text-center">
          <div className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            {discovery?.enabled ? '✓' : '✗'}
          </div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">Beacon</div>
          {discovery && (
            <div className="text-[10px] text-neutral-400 dark:text-neutral-500 mt-0.5">
              {discovery.sent} enviados
            </div>
          )}
        </div>
      </div>

      <div className="mb-4 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl">
        <div className="flex items-center gap-2 text-sm">
          <Cpu className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          <span className="text-neutral-600 dark:text-neutral-400">Dispositivo de saída:</span>
          <span className="font-mono text-neutral-900 dark:text-neutral-100 truncate flex-1">{deviceName || 'Nenhum selecionado'}</span>
        </div>
      </div>

      <div className="flex gap-3">
        {running ? (
          <button
            onClick={() => onStop()}
            disabled={loading}
            className="flex-1 btn-danger"
          >
            Parar Servidor
          </button>
        ) : (
          <button
            onClick={() => onStart()}
            disabled={loading}
            className="flex-1 btn-primary"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Iniciando...
              </>
            ) : (
              'Iniciar Servidor'
            )}
          </button>
        )}
      </div>
    </div>
  );
}