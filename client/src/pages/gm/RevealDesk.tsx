import { ROLES } from '@shared/roles';
import { Icon } from '../../components/Icon';
import { RoleThumb } from '../../components/RoleArt';
import type { GmApi, GmView } from '../../lib/useGm';

/**
 * Période de révélation : sans limite de temps, chaque joueur découvre sa carte.
 * Le Maître du jeu voit qui l'a déjà retournée et décide de clore la période.
 */
export function RevealDesk({ gm, game }: { gm: GmApi; game: GmView }) {
  const players = [...game.players].sort((a, b) => a.seat - b.seat);
  const seen = new Set(game.sawCard);
  const count = players.filter((p) => seen.has(p.id)).length;
  const all = count === players.length;
  return (
    <section className="panel p-5">
      <p className="font-title text-xs uppercase tracking-[0.35em] text-or-300/80">Avant la première nuit</p>
      <h2 className="mt-1 font-display text-3xl text-gold">Période de révélation</h2>
      <p className="mt-2 text-sm text-parchemin-200">
        Chaque joueur retourne sa carte sur son téléphone, sans limite de temps. Quand vous closez la révélation,
        la première nuit tombe et toutes les cartes se retournent face cachée : seuls les joueurs appelés pourront revoir la leur.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-gradient-to-r from-or-500 to-or-300 transition-all duration-500" style={{ width: `${(count / Math.max(players.length, 1)) * 100}%` }} />
        </div>
        <span className="text-sm text-or-100">{count}/{players.length} ont vu leur carte</span>
      </div>

      <ul className="mt-4 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {players.map((p) => (
          <li key={p.id} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ${seen.has(p.id) ? 'bg-foret-900/30 ring-foret-400/40' : 'bg-white/5 ring-white/10'}`}>
            {p.roleId && <RoleThumb roleId={p.roleId} size={26} />}
            <span className="min-w-0 flex-1 truncate">{p.name}<span className="block text-xs text-parchemin-300/70">{p.roleId ? ROLES[p.roleId].name : ''}</span></span>
            {seen.has(p.id)
              ? <span className="flex items-center gap-1 text-xs text-foret-400"><Icon name="eye" className="h-3.5 w-3.5" />Vue</span>
              : <span className="text-xs text-parchemin-300/60">{p.connected ? 'pas encore' : 'déconnecté(e)'}</span>}
          </li>
        ))}
      </ul>

      <button className="btn-gold mt-5 w-full" onClick={() => gm.act('closeReveal')}>
        <Icon name="moon" />Clore la révélation — la première nuit tombe
      </button>
      {!all && <p className="mt-2 text-center text-xs text-parchemin-300/70">Certains n’ont pas encore retourné leur carte : vous pouvez tout de même clore.</p>}
    </section>
  );
}
