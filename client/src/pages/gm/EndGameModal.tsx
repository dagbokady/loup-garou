import { useEffect, useState } from 'react';
import type { WinnerCamp } from '@shared/types';
import { Modal } from '../../components/Modal';
import type { GmApi, GmView } from '../../lib/useGm';

const LABELS: Record<WinnerCamp, string> = {
  village: 'Le Village',
  loups: 'Les Loups-Garous',
  loupBlanc: 'Le Loup Blanc',
  flute: 'Le Joueur de Flûte',
  ange: 'L’Ange Déchu',
  amoureux: 'Les Amoureux',
};

/**
 * Fin de partie : le système affiche les conditions de victoire,
 * le MJ choisit le ou les camps gagnants et ajuste la liste des gagnants.
 */
export function EndGameModal({ open, onClose, gm, game }: { open: boolean; onClose: () => void; gm: GmApi; game: GmView }) {
  const [camps, setCamps] = useState<WinnerCamp[]>([]);
  const [winners, setWinners] = useState<Set<string>>(new Set());

  // Pré-sélection : les conditions remplies.
  useEffect(() => {
    if (!open) return;
    const met = game.victoryChecks.filter((c) => c.met).map((c) => c.id);
    setCamps(met);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    setWinners(new Set(camps.flatMap((c) => game.winnersByCamp[c] ?? [])));
  }, [camps, game.winnersByCamp]);

  const toggleCamp = (c: WinnerCamp) => setCamps((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const toggleWinner = (id: string) => setWinners((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const available = (Object.keys(LABELS) as WinnerCamp[]).filter((c) => c === 'village' || c === 'loups' || game.victoryChecks.some((v) => v.id === c));

  return (
    <Modal open={open} onClose={onClose} title="Fin de partie">
      <h3 className="label">Conditions de victoire</h3>
      <ul className="space-y-1 text-sm">
        {game.victoryChecks.map((c) => (
          <li key={c.id} className={c.met ? 'text-or-100' : 'text-parchemin-300/70'}>
            {c.met ? '✦' : '◌'} <strong>{c.label}</strong> — {c.detail}
          </li>
        ))}
      </ul>

      <h3 className="label mt-5">Camp(s) gagnant(s)</h3>
      <div className="flex flex-wrap gap-2">
        {available.map((c) => (
          <button key={c} onClick={() => toggleCamp(c)} className={`rounded-lg border px-3 py-1.5 text-sm ${camps.includes(c) ? 'border-or-300 bg-or-400/90 text-nuit-950' : 'border-or-500/30 bg-nuit-950/60'}`}>
            {LABELS[c]}
          </button>
        ))}
      </div>

      {camps.length > 0 && (
        <>
          <h3 className="label mt-5">Joueurs gagnants ({winners.size})</h3>
          <div className="flex flex-wrap gap-1.5">
            {game.players.map((p) => (
              <button key={p.id} onClick={() => toggleWinner(p.id)} className={`rounded-full border px-3 py-0.5 text-sm ${winners.has(p.id) ? 'border-or-300 bg-or-400/20 text-or-100' : 'border-or-500/20 text-parchemin-300/50'}`}>
                {winners.has(p.id) ? '✦ ' : ''}{p.name}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 flex flex-wrap justify-between gap-2">
        <button className="btn-ghost btn-sm" onClick={async () => { if ((await gm.act('cancel')).ok) onClose(); }}>Annuler la partie</button>
        <button
          className="btn-gold"
          disabled={!camps.length}
          onClick={async () => {
            if ((await gm.act('end', { winner: camps.map((c) => LABELS[c]).join(' & '), winnerIds: [...winners] })).ok) onClose();
          }}
        >
          Clore et révéler les rôles
        </button>
      </div>
    </Modal>
  );
}
