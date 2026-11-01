import { Trash2, Filter } from 'lucide-react';
import { useState, useMemo } from 'react';
import { LogEntry } from '../types';

interface LogConsoleProps {
  logs: LogEntry[];
  onClear?: () => void;
}

export function LogConsole({ logs, onClear }: LogConsoleProps) {
  const [filter, setFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const [expanded, setExpanded] = useState(false);

  const filteredLogs = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter(log => log.level === filter);
  }, [logs, filter]);

  const displayLogs = expanded ? filteredLogs : filteredLogs.slice(-20);

  if (logs.length === 0) {
    return (
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
            <Filter className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
            Logs do Sistema
          </h2>
        </div>
        <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
          Nenhum log ainda. Inicie o servidor para ver a atividade.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 flex items-center gap-2">
          <Filter className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
          Logs do Sistema
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="input-select py-1.5 px-3 text-xs w-auto"
          >
            <option value="all">Todos</option>
            <option value="info">Info</option>
            <option value="warn">Avisos</option>
            <option value="error">Erros</option>
          </select>
          <button
            onClick={() => setExpanded(!expanded)}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            {expanded ? 'Mostrar menos' : 'Mostrar todos'}
          </button>
          <button
            onClick={() => onClear?.()}
            className="p-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
            disabled={!onClear}
            title="Limpar logs"
          >
            <Trash2 className="w-4 h-4 text-neutral-500 dark:text-neutral-400" />
          </button>
        </div>
      </div>

      <div className="bg-neutral-50 dark:bg-neutral-900 rounded-xl max-h-96 overflow-auto scrollbar-thin font-mono text-xs">
        {displayLogs.length === 0 ? (
          <p className="text-center text-neutral-500 dark:text-neutral-400 py-8">
            Nenhum log para o filtro selecionado
          </p>
        ) : (
          <div className="p-3 space-y-1">
            {displayLogs.map((log) => (
              <div
                key={log.id}
                className={`flex gap-2 px-2 py-1 rounded ${
                  log.level === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                  log.level === 'warn' ? 'bg-yellow-50 dark:bg-yellow-900/20' :
                  'hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                <span className="text-neutral-400 dark:text-neutral-500 w-20 shrink-0 font-mono">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className={`w-10 shrink-0 text-xs font-medium ${
                  log.level === 'error' ? 'text-red-600 dark:text-red-400' :
                  log.level === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-blue-600 dark:text-blue-400'
                }`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-neutral-700 dark:text-neutral-300 truncate flex-1">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>{filteredLogs.length} de {logs.length} entradas</span>
        <span>Atualizado: {new Date().toLocaleTimeString()}</span>
      </div>
    </div>
  );
}