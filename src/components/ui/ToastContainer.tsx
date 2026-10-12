import React, { useEffect, useState } from 'react';
import { toast, ToastItem } from '../../lib/toast';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export const ToastContainer: React.FC = () => {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe((updated) => {
      setItems(updated);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto z-[100] flex flex-col space-y-2 sm:max-w-sm sm:w-full pointer-events-none">
      {items.map((item) => {
        const isSuccess = item.type === 'success';
        const isError = item.type === 'error';

        return (
          <div
            key={item.id}
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-start justify-between space-x-3 transition-all animate-in slide-in-from-bottom-2 duration-200 ${
              isSuccess
                ? 'bg-zinc-900 border-emerald-800 text-white'
                : isError
                ? 'bg-zinc-900 border-red-800 text-white'
                : 'bg-zinc-900 border-zinc-700 text-white'
            }`}
          >
            <div className="flex items-start space-x-3 min-w-0">
              <div className="mt-0.5 shrink-0">
                {isSuccess ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : isError ? (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                ) : (
                  <Info className="w-5 h-5 text-sky-400" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold leading-tight truncate">{item.title}</p>
                {item.description && (
                  <p className="text-[11px] text-zinc-400 mt-1 leading-snug">{item.description}</p>
                )}
              </div>
            </div>

            <button
              onClick={() => toast.dismiss(item.id)}
              className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
