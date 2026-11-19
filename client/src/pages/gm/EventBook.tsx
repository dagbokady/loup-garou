import { useState } from 'react';
import type { GameEvent } from '@shared/types';
import { fmtTime } from '../../lib/api';
import type { GmView } from '../../lib/useGm';

const ICONS: Record<GameEvent['type'], string> = {
  system: '✧', phase: '🔔', death: '✝', revive: '✚', action: '🪶', vote: '🗳', chief: '👑', whisper: '✉', role: '🃏', end: '⚑', announce: '📣',
};

/** Le Livre des événements : historique de la partie. */
export function EventBook({ game }: { game: GmView }) {
  const [filter, setFilter] = useState<'all' | 'public' | 'gm'>('all');
  const events = [...game.events].reverse().filter((e) => filter === 'all' || e.visibility === filter);
  return (
    <section className="panel-parchment flex flex-col p-4">
      <div className="my-2 flex justify-center gap-1">
        {(
          [
            ['all', 'Tout'],
            ['public', 'Public'],
            ['gm', 'Secret'],
          ] as const
        ).map(([f, l]) => (
          <button key={f} onClick={() => setFilter(f)} className={`rounded-full border px-3 py-0.5 font-title text-xs ${filter === f ? 'border-nuit-700 bg-nuit-800 text-parchemin-100' : 'border-nuit-700/40 text-nuit-800'}`}>{l}</button>
        ))}
      </div>
      <ol className="space-y-2">
        {events.map((e) => (
          <li key={e.id} className="border-b border-or-700/20 pb-1.5 text-[15px] leading-snug">
            <span className="mr-1">{ICONS[e.type]}</span>
            <span className="font-title text-[11px] uppercase tracking-wider text-or-700">
              {e.phase === 'night' ? `Nuit ${e.round}` : e.phase === 'day' ? `Jour ${e.round}` : e.phase === 'lobby' ? 'Préparation' : 'Fin'} · {fmtTime(e.at)}
              {e.visibility === 'gm' && ' · secret'}
            </span>
            <p className="text-nuit-900">{e.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
