import { Link } from 'react-router-dom';
import { ROLES } from '@shared/roles';
import { RoleArt } from '../../components/RoleArt';
import { api, downloadJson } from '../../lib/api';
import { useToast } from '../../lib/toast';
import type { GmApi, GmView } from '../../lib/useGm';
import { NoGame } from './NoGame';

/** Résumé d'une partie qui vient de se terminer. */
export function EndedView({ gm, game }: { gm: GmApi; game: GmView }) {
  const toast = useToast();
  const exportGame = async () => {
    try {
      downloadJson(`loup-garou-${game.code}.json`, await api('/api/games/current/export'));
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  return (
    <div className="grid animate-rise gap-6 lg:grid-cols-[1fr_420px]">
      <section className="panel p-5 text-center">
        <p className="font-title text-xs uppercase tracking-[0.4em] text-or-300/80">Partie {game.code} terminée</p>
        <h1 className="mt-2 font-display text-4xl text-gold">Victoire : {game.winner}</h1>
        <div className="ornament">⚑</div>
        <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {game.players.map((p) => (
            <figure key={p.id} className={`${p.alive ? '' : 'opacity-60'} ${game.winnerIds.includes(p.id) ? 'rounded-xl ring-2 ring-or-300 ring-offset-2 ring-offset-nuit-900' : ''}`}>
              {p.roleId && <RoleArt roleId={p.roleId} className={`aspect-[2/3] w-full rounded-lg border border-or-500/50 ${p.alive ? '' : 'grayscale'}`} />}
              <figcaption className="mt-1 text-sm leading-tight">
                {game.winnerIds.includes(p.id) ? '✦ ' : ''}{p.alive ? '' : '✝ '}{p.name}
                <span className="block text-xs text-or-200/70">{p.roleId ? ROLES[p.roleId].name : ''}</span>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="frame mx-auto mt-6 max-w-md p-4">
          <p className="font-title text-lg text-or-100">Une revanche ?</p>
          <p className="mt-1 text-sm text-parchemin-300">Les {game.players.length} joueurs restent connectés avec le même code <span className="font-mono tracking-widest text-parchemin-100">{game.code}</span> : personne n’a besoin de rescanner. Vous repartez en préparation (composition conservée, nouvelle distribution).</p>
          <button className="btn-gold mt-3 w-full" onClick={() => gm.rematch()}>↻ Rejouer avec les mêmes joueurs</button>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button className="btn-ghost" onClick={exportGame}>⇩ Exporter en JSON</button>
          <Link className="btn-ghost" to="/mj/archives">📚 Mes archives</Link>
        </div>
      </section>
      <NoGame gm={gm} />
    </div>
  );
}
