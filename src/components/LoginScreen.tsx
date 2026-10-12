import React, { useState } from 'react';
import { Dumbbell, Lock, Phone } from 'lucide-react';
import type { Profile } from '../types';
import { login } from '../lib/auth';

export const LoginScreen: React.FC<{ onLoggedIn: (p: Profile) => void }> = ({ onLoggedIn }) => {
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const r = await login(phone, pin);
    setBusy(false);
    if (r.profile) onLoggedIn(r.profile);
    else { setError(r.error || 'Login failed'); setPin(''); }
  };

  return (
    <div className="min-h-[100dvh] bg-zinc-950 text-white flex items-center justify-center px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-5" aria-label="Sign in">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-600 via-red-500 to-orange-500 flex items-center justify-center shadow-lg shadow-red-500/20">
            <Dumbbell className="w-7 h-7 text-white -rotate-12" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight uppercase">Pulse <span className="text-red-500">Fitness</span></h1>
          <p className="text-xs text-zinc-400">Sign in with your phone number and PIN</p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Phone number</span>
          <div className="flex items-center bg-zinc-950 border border-zinc-700 focus-within:border-red-500 rounded-xl px-3">
            <Phone className="w-4 h-4 text-zinc-400" />
            <input
              name="phone" type="tel" inputMode="numeric" autoComplete="username" required
              value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+ ]/g, ''))}
              placeholder="98765 43210" className="flex-1 bg-transparent py-3 px-2 text-base outline-none"
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">PIN</span>
          <div className="flex items-center bg-zinc-950 border border-zinc-700 focus-within:border-red-500 rounded-xl px-3">
            <Lock className="w-4 h-4 text-zinc-400" />
            <input
              name="pin" type="password" inputMode="numeric" autoComplete="current-password" required
              pattern="\d{4,8}" maxLength={8} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••" className="flex-1 bg-transparent py-3 px-2 text-base tracking-[0.4em] outline-none"
            />
          </div>
        </label>

        {error && <p role="alert" className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-xl px-3 py-2">{error}</p>}

        <button type="submit" disabled={busy}
          className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 font-black uppercase tracking-wide text-sm transition-all">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-[11px] text-center text-zinc-400">Forgot your PIN? Ask the gym owner to reset it.</p>
      </form>
    </div>
  );
};
