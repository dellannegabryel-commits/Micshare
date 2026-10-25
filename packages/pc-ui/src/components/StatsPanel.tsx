import { AlertTriangle, CheckCircle, Info, Wifi, Database, Zap, RotateCcw } from 'lucide-react';
import { ServerStats } from '../types';

interface StatsPanelProps {
  stats: ServerStats;
}

function StatItem({ label, value, icon, color, warning }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color?: string;
  warning?: boolean;
}) {
  return (
    <div className="stat-pill flex items-center gap-3 px-4 py-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color || 'bg-neutral-100 dark:bg-neutral-800'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{label}</p>
        <p className={`font-mono text-sm font-semibold ${warning ? 'text-yellow-600 dark:text-yellow-400' : 'text-neutral-900 dark:text-neutral-100'}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export function StatsPanel({ stats }: StatsPanelProps) {
  if (!stats.running) {
    return (
      <div className="glass-panel p-6">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
          <Info className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          Estatísticas em Tempo Real
        </h2>
        <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          Inicie o servidor para ver estatísticas
        </p>
      </div>
    );
  }

  const { jitter, fps, lossPct, sessions } = stats;

  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        Estatísticas em Tempo Real
      </h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <StatItem
          label="FPS (frames/s)"
          value={fps.toFixed(1)}
          icon={<Zap className="w-4 h-4 text-sky-500" />}
          color="bg-sky-100 dark:bg-sky-900/30"
        />
        <StatItem
          label="Perda de Pacotes"
          value={`${lossPct.toFixed(1)}%`}
          icon={lossPct > 5 ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : lossPct > 1 ? (
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500" />
          )}
          color={lossPct > 5 ? 'bg-red-100 dark:bg-red-900/30' : lossPct > 1 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-green-100 dark:bg-green-900/30'}
          warning={lossPct > 1}
        />
        <StatItem
          label="Buffer Jitter"
          value={`${jitter.bufferMs}ms`}
          icon={<Database className="w-4 h-4 text-purple-500" />}
          color="bg-purple-100 dark:bg-purple-900/30"
          warning={jitter.bufferMs > 80}
        />
        <StatItem
          label="Gaps Detectados"
          value={jitter.gaps}
          icon={<RotateCcw className="w-4 h-4 text-orange-500" />}
          color="bg-orange-100 dark:bg-orange-900/30"
          warning={jitter.gaps > 10}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatItem
          label="Underruns"
          value={jitter.underruns}
          icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
          color="bg-red-100 dark:bg-red-900/30"
          warning={jitter.underruns > 5}
        />
        <StatItem
          label="Fast-forwards"
          value={jitter.fastForwards}
          icon={<Zap className="w-4 h-4 text-blue-500" />}
          color="bg-blue-100 dark:bg-blue-900/30"
        />
        <StatItem
          label="Flushes"
          value={jitter.flushes}
          icon={<RotateCcw className="w-4 h-4 text-pink-500" />}
          color="bg-pink-100 dark:bg-pink-900/30"
          warning={jitter.flushes > 0}
        />
        <StatItem
          label="Reconexões"
          value={jitter.gaps > 0 ? 'Ver gaps' : '0'}
          icon={<Wifi className="w-4 h-4 text-indigo-500" />}
          color="bg-indigo-100 dark:bg-indigo-900/30"
        />
      </div>

      {/* Detailed metrics */}
      <details className="mt-4 group">
        <summary className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400 cursor-pointer">
          <RotateCcw className="w-4 h-4 transition-transform group-open:rotate-180" />
          Detalhes técnicos
        </summary>
        <div className="mt-3 p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl text-xs font-mono space-y-1">
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Frames recebidos:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{jitter.received}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Frames perdidos:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{jitter.lost}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500 dark:text-neutral-400">Sessões ativas:</span>
            <span className="text-neutral-900 dark:text-neutral-100">{sessions}</span>
          </div>
        </div>
      </details>
    </div>
  );
}