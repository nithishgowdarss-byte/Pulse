import React from 'react';

export type SegmentOption<T extends string = string> = {
  value: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
};

interface SegmentedToggleProps<T extends string = string> {
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  className?: string;
  size?: 'sm' | 'default';
}

export function SegmentedToggle<T extends string = string>({
  value,
  options,
  onChange,
  className = '',
  size = 'default',
}: SegmentedToggleProps<T>) {
  return (
    <div
      className={`inline-flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-2xl gap-1 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex items-center space-x-2 font-extrabold uppercase tracking-wider rounded-xl transition-all ${
              size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-4 py-2 text-xs'
            } ${
              active
                ? 'bg-red-600 text-white shadow-lg shadow-red-950/50'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
            }`}
          >
            {opt.icon && <span className="shrink-0">{opt.icon}</span>}
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  active ? 'bg-red-950 text-red-200' : 'bg-zinc-800 text-zinc-400'
                }`}
              >
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
