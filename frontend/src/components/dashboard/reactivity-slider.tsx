'use client';

export const REACTIVITY_LEVELS = [
  { value: 1, label: 'Minimum', description: 'Security breaches and active fraud only', color: 'bg-blue-500' },
  { value: 2, label: 'Low', description: 'Security + money at risk + deadlines within 24h', color: 'bg-blue-400' },
  { value: 3, label: 'Balanced', description: 'Financial events, 48h deadlines, direct requests', color: 'bg-yellow-500' },
  { value: 4, label: 'High', description: 'All transactions, weekly deadlines, any personal email', color: 'bg-orange-500' },
  { value: 5, label: 'Maximum', description: 'Everything including subscribed content and events', color: 'bg-red-500' },
];

interface ReactivitySliderProps {
  value: number;
  onChange: (val: number) => void;
  variant?: 'compact' | 'full';
  disabled?: boolean;
}

export function ReactivitySlider({ value, onChange, variant = 'full', disabled = false }: ReactivitySliderProps) {
  const current = REACTIVITY_LEVELS.find((l) => l.value === value) ?? REACTIVITY_LEVELS[2];

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 tabular-nums shrink-0">Reactivity</span>
        <div className="flex items-center gap-0.5">
          {REACTIVITY_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => !disabled && onChange(level.value)}
              disabled={disabled}
              title={`${level.label}: ${level.description}`}
              className={`w-5 h-5 rounded-full text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                value === level.value
                  ? `${level.color} text-white shadow-raised-sm scale-110`
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500 hidden sm:block">{current.label}</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-700">Alert Reactivity</h4>
          <p className="text-xs text-gray-500 mt-0.5">How aggressively the agent alerts you</p>
        </div>
        <div className="text-right">
          <span className="text-lg font-bold text-gray-900 tabular-nums">{value}/5</span>
          <p className="text-xs text-gray-500">{current.label}</p>
        </div>
      </div>

      <div className="relative mb-3">
        <input
          type="range"
          min={1}
          max={5}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseInt(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #eab308 50%, #ef4444 100%)`,
          }}
        />
        <div className="flex justify-between mt-1.5">
          {REACTIVITY_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => !disabled && onChange(level.value)}
              disabled={disabled}
              className={`w-6 h-6 rounded-full text-xs font-semibold transition-all disabled:cursor-not-allowed ${
                value === level.value
                  ? `${level.color} text-white shadow-raised-sm`
                  : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              {level.value}
            </button>
          ))}
        </div>
      </div>

      <div className="panel-inset px-3 py-2">
        <p className="text-xs text-gray-600">{current.description}</p>
      </div>
    </div>
  );
}
