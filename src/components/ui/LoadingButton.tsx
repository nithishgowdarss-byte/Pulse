import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'amber';
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      loading = false,
      loadingText,
      disabled,
      className = '',
      children,
      variant = 'primary',
      size = 'md',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-extrabold transition-all select-none disabled:opacity-50 disabled:cursor-not-allowed rounded-xl';

    const sizeStyles = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-xs',
      lg: 'px-5 py-2.5 text-sm',
    }[size];

    const variantStyles = {
      primary: 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-950/40',
      secondary: 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700',
      outline: 'bg-transparent border border-zinc-700 hover:border-zinc-500 text-zinc-300',
      danger: 'bg-red-950/80 hover:bg-red-900 border border-red-800 text-red-300',
      amber: 'bg-amber-600 hover:bg-amber-500 text-zinc-950 shadow',
    }[variant];

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
        {...props}
      >
        {loading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin shrink-0" />}
        {loading && loadingText ? loadingText : children}
      </button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';
