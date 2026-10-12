import React from 'react';

const loaders: Array<() => Promise<unknown>> = [];
/** React.lazy for named exports; registers the loader so it can be warmed (and cached by the SW) when idle. */
export function lazyNamed<T extends React.ComponentType<any>>(load: () => Promise<Record<string, any>>, name: string): React.LazyExoticComponent<T> {
  loaders.push(load);
  return React.lazy(() => load().then((m) => ({ default: (m[name] || m.default) as T })));
}
/** Warm all lazy chunks after first paint so modals work offline later. */
export function prefetchLazy() {
  const run = () => loaders.forEach((l) => l().catch(() => {}));
  const w = window as any;
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 }); else setTimeout(run, 2500);
}

export class LazyBoundary extends React.Component<{ children: React.ReactNode }, { err: string }> {
  state = { err: '' };
  static getDerivedStateFromError(e: any) { return { err: String(e?.message || e) }; }
  render() {
    if (this.state.err) return (
      <div role="alert" className="fixed bottom-4 inset-x-4 z-[95] mx-auto max-w-md bg-red-950 border border-red-800 text-red-100 text-xs rounded-2xl p-3 flex items-center gap-2">
        <span className="flex-1">{navigator.onLine ? 'This screen failed to load.' : 'You are offline and this screen has not been downloaded yet.'} Reconnect, then retry.</span>
        <button className="px-3 py-1.5 rounded-lg bg-red-800 font-bold" onClick={() => location.reload()}>Retry</button>
        <button className="px-3 py-1.5 rounded-lg bg-zinc-800 font-bold" onClick={() => (this as any).setState({ err: "" })}>Dismiss</button>
      </div>
    );
    return (this as any).props.children;
  }
}
export const Loading: React.FC = () => <div className="fixed inset-0 z-[85] bg-black/50 flex items-center justify-center text-sm text-zinc-200" role="status">Loading…</div>;
