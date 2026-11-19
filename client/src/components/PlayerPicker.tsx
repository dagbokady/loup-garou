import type { PlayerState } from '@shared/types';

/** Liste de sélection de joueurs (simple ou multiple). */
export function PlayerPicker({
  players,
  value,
  onChange,
  max = 1,
  exclude = [],
  disabledIds = [],
}: {
  players: PlayerState[];
  value: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  exclude?: string[];
  disabledIds?: string[];
}) {
  const list = players.filter((p) => p.alive && !exclude.includes(p.id)).sort((a, b) => a.seat - b.seat);
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else if (max === 1) onChange([id]);
    else if (value.length < max) onChange([...value, id]);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((p) => {
        const on = value.includes(p.id);
        const disabled = disabledIds.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={disabled}
            onClick={() => toggle(p.id)}
            className={`rounded-full border px-3 py-1 text-sm transition disabled:opacity-30 ${
              on ? 'border-or-300 bg-or-400/90 text-nuit-950 shadow-glow' : 'border-or-500/30 bg-nuit-950/60 text-parchemin-100 hover:border-or-400'
            }`}
          >
            {p.name}
          </button>
        );
      })}
      {!list.length && <span className="text-sm text-parchemin-300/60">Aucun joueur disponible.</span>}
    </div>
  );
}
