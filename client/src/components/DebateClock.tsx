import { useEffect, useState } from 'react';
import type { DebateTimer } from '@shared/types';
import { Icon } from './Icon';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Compte à rebours du débat, identique sur tous les écrans (heure de fin fixée par le serveur). */
export function DebateClock({ debate, compact = false }: { debate: DebateTimer | null | undefined; compact?: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!debate) return;
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, [debate]);
  if (!debate) return null;
  const left = Math.max(0, Math.ceil((debate.endsAt - now) / 1000));
  const ratio = Math.min(1, left / Math.max(1, debate.seconds));
  const urgent = left > 0 && left <= 15;
  const over = left === 0;
  return (
    <div className={`rounded-xl bg-nuit-950/70 ring-1 ${over ? 'ring-sang-500/60' : urgent ? 'ring-sang-500/50' : 'ring-or-500/30'} ${compact ? 'px-3 py-2' : 'p-4'} text-center`} role="timer" aria-live={urgent ? 'assertive' : 'off'}>
      <p className="flex items-center justify-center gap-1.5 text-xs uppercase tracking-[0.3em] text-parchemin-300">
        <Icon name="clock" className="h-3.5 w-3.5" />{over ? 'Fin du débat' : 'Débat'}
      </p>
      <p className={`font-title tabular-nums ${compact ? 'text-2xl' : 'text-4xl'} ${over || urgent ? 'text-red-300' : 'text-gold'} ${urgent ? 'animate-pulse' : ''}`}>{fmt(left)}</p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-[width] duration-300 ${urgent || over ? 'bg-sang-500' : 'bg-or-400'}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
