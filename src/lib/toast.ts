type ToastType = 'success' | 'error' | 'info' | 'message' | 'warning';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

let toasts: ToastItem[] = [];
const listeners: Set<ToastListener> = new Set();

function notify() {
  listeners.forEach((fn) => fn([...toasts]));
}

export const toast = {
  success: (title: string, opts?: { description?: string; duration?: number }) => {
    toast.show('success', title, opts);
  },
  error: (title: string, opts?: { description?: string; duration?: number }) => {
    toast.show('error', title, opts);
  },
  warning: (title: string, opts?: { description?: string; duration?: number }) => {
    toast.show('warning', title, opts);
  },
  message: (title: string, opts?: { description?: string; duration?: number }) => {
    toast.show('info', title, opts);
  },
  info: (title: string, opts?: { description?: string; duration?: number }) => {
    toast.show('info', title, opts);
  },
  show: (type: ToastType, title: string, opts?: { description?: string; duration?: number }) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const duration = opts?.duration ?? 4000;
    const item: ToastItem = {
      id,
      type,
      title,
      description: opts?.description,
      duration,
    };
    toasts = [item, ...toasts].slice(0, 5);
    notify();

    if (duration > 0) {
      setTimeout(() => {
        toast.dismiss(id);
      }, duration);
    }
  },
  dismiss: (id: string) => {
    toasts = toasts.filter((t) => t.id !== id);
    notify();
  },
  subscribe: (fn: ToastListener) => {
    listeners.add(fn);
    fn([...toasts]);
    return () => {
      listeners.delete(fn);
    };
  },
};
