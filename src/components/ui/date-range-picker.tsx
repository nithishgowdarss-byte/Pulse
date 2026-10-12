import React from 'react';
import dayjs from 'dayjs';
import { Calendar } from 'lucide-react';

export type DateRange = {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
};

interface DateRangePickerProps {
  value: DateRange;
  onChange: (next: DateRange) => void;
  maxDays?: number;
  className?: string;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  maxDays = 93,
  className = '',
}) => {
  const setPreset = (days: number) => {
    onChange({
      from: dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD'),
      to: dayjs().format('YYYY-MM-DD'),
    });
  };

  const diffDays = dayjs(value.to).diff(dayjs(value.from), 'day');

  return (
    <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-3 ${className}`}>
      {/* Preset Pills */}
      <div className="flex items-center space-x-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800">
        <button
          type="button"
          onClick={() => setPreset(1)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            diffDays === 0
              ? 'bg-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setPreset(7)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            diffDays === 6
              ? 'bg-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          7d
        </button>
        <button
          type="button"
          onClick={() => setPreset(14)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            diffDays === 13
              ? 'bg-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          14d
        </button>
        <button
          type="button"
          onClick={() => setPreset(30)}
          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            diffDays === 29
              ? 'bg-red-600 text-white shadow'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          30d
        </button>
      </div>

      {/* Date Inputs */}
      <div className="flex items-center space-x-2 bg-zinc-950 px-3 py-1.5 rounded-xl border border-zinc-800 text-xs">
        <Calendar className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] font-bold text-zinc-500 uppercase">From</span>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-0.5 text-zinc-200 font-mono focus:outline-none focus:border-red-500"
          />
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-[10px] font-bold text-zinc-500 uppercase">To</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-0.5 text-zinc-200 font-mono focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {diffDays > maxDays && (
        <span className="text-[11px] text-amber-400 font-medium">
          Large range (recommended max {maxDays} days)
        </span>
      )}
    </div>
  );
};
