import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Background } from '../../components/Background';
import { Grimoire } from '../../components/Grimoire';
import { Icon } from '../../components/Icon';
import { useGm } from '../../lib/useGm';
import { EndedView } from './EndedView';
import { NoGame } from './NoGame';
import { Preparation } from './Preparation';
import { RunningTable } from './RunningTable';

/** Espace du Maître du jeu : aiguille vers la bonne vue selon l'état de la partie. */
export function GmTable() {
  const gm = useGm();
  const [grimoire, setGrimoire] = useState(false);
  const g = gm.game;
  const mode = g?.phase === 'day' || g?.phase === 'ended' ? 'day' : 'night';

  return (
    <div className="min-h-screen pb-20 lg:pb-6">
      <Background mode={mode} />
      <header className="sticky top-0 z-30 border-b border-or-500/30 bg-nuit-950/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-2 sm:px-5">
          <Link to="/" className="font-display text-lg text-gold sm:text-xl">Loup-Garou</Link>
          <span className="hidden font-title text-xs uppercase tracking-widest text-or-300/70 sm:inline">· Maître du jeu</span>
          <div className="ml-auto flex items-center gap-2">
            {!gm.connected && <span className="chip border-sang-500/60 text-red-300">Hors ligne…</span>}
            <button className="btn-ghost btn-sm" onClick={() => setGrimoire(true)} title="Le Grimoire"><Icon name="book" className="h-4 w-4" /><span className="hidden sm:inline">Grimoire</span></button>
            <Link className="btn-ghost btn-sm" to="/mj/archives" title="Anciennes parties"><Icon name="library" className="h-4 w-4" /><span className="hidden sm:inline">Archives</span></Link>
            <button className="btn-ghost btn-sm" onClick={gm.logout} title="Se déconnecter"><Icon name="logout" className="h-4 w-4" /><span className="hidden sm:inline">{gm.username}</span></button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 pt-4 sm:px-5">
        {!gm.ready ? (
          <p className="mt-20 text-center font-title text-or-200">Ouverture du grimoire…</p>
        ) : !g || g.status === 'cancelled' ? (
          <NoGame gm={gm} />
        ) : g.status === 'lobby' ? (
          <Preparation gm={gm} game={g} />
        ) : g.status === 'ended' ? (
          <EndedView gm={gm} game={g} />
        ) : (
          <RunningTable gm={gm} game={g} openGrimoire={() => setGrimoire(true)} />
        )}
      </main>
      <Grimoire open={grimoire} onClose={() => setGrimoire(false)} />
    </div>
  );
}
