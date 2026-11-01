import { Mic, MicOff, Volume2, SlidersHorizontal } from 'lucide-react';

interface ControlsPanelProps {
  muted: boolean;
  volume: number;
  onMuteChange: (muted: boolean) => void;
  onVolumeChange: (volume: number) => void;
}

export function ControlsPanel({ muted, volume, onMuteChange, onVolumeChange }: ControlsPanelProps) {
  return (
    <div className="glass-panel p-6">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4 flex items-center gap-2">
        <SlidersHorizontal className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
        Controles de Áudio
      </h2>

      <div className="space-y-4">
        {/* Mute Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              muted ? 'bg-red-100 dark:bg-red-900/30' : 'bg-green-100 dark:bg-green-900/30'
            }`}>
              {muted ? (
                <MicOff className="w-6 h-6 text-red-600 dark:text-red-400" />
              ) : (
                <Mic className="w-6 h-6 text-green-600 dark:text-green-400" />
              )}
            </div>
            <div>
              <p className="font-medium text-neutral-900 dark:text-neutral-50">
                {muted ? 'Microfone Mutado' : 'Microfone Ativo'}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {muted ? 'O áudio não está sendo transmitido' : 'Transmitindo áudio para o PC'}
              </p>
            </div>
          </div>
          <button
            onClick={() => onMuteChange(!muted)}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              muted ? 'bg-neutral-300 dark:bg-neutral-600' : 'bg-sky-500'
            }`}
            aria-label={muted ? 'Ativar microfone' : 'Mutar microfone'}
          >
            <span className={`absolute top-1 transition-transform duration-200 w-6 h-6 rounded-full bg-white shadow-lg ${
              muted ? 'left-1' : 'right-1'
            }`} />
          </button>
        </div>

        {/* Volume Slider */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
              <span className="font-medium text-neutral-900 dark:text-neutral-50">Volume</span>
            </div>
            <span className="text-sm font-mono text-neutral-600 dark:text-neutral-400">
              {Math.round(volume * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="4"
            step="0.1"
            value={volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-lg [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-500 [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white"
          />
          <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            <span>0%</span>
            <span>100%</span>
            <span>200%</span>
            <span>300%</span>
            <span>400%</span>
          </div>
        </div>
      </div>
    </div>
  );
}