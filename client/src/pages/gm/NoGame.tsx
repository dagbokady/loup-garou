import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GmApi } from '../../lib/useGm';

export function NoGame({ gm }: { gm: GmApi }) {
  const [n, setN] = useState(8);
  return (
    <div className="mx-auto mt-10 max-w-lg animate-rise">
      <div className="panel p-6 text-center sm:p-8">
        <img src="/assets/grimoire.webp" alt="" className="mx-auto w-40 animate-float drop-shadow-[0_0_25px_rgba(124,77,204,0.6)]" />
        <h1 className="mt-2 font-display text-3xl text-gold">Une nouvelle veillée</h1>
        <p className="mt-2 text-parchemin-200">Vous n’avez aucune partie active. Combien d’âmes rejoindront le village ce soir ?</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button className="btn-ghost h-11 w-11 text-xl" onClick={() => setN((x) => Math.max(3, x - 1))}>−</button>
          <span className="w-16 font-display text-4xl text-or-200">{n}</span>
          <button className="btn-ghost h-11 w-11 text-xl" onClick={() => setN((x) => Math.min(40, x + 1))}>+</button>
        </div>
        <p className="font-title text-xs uppercase tracking-widest text-or-300/70">joueurs attendus</p>
        <button className="btn-gold mt-6 w-full py-3" onClick={() => gm.createGame(n)}>Créer la partie</button>
        <Link to="/mj/archives" className="mt-4 inline-block text-or-200 underline decoration-or-500/40 underline-offset-4">Consulter mes anciennes parties</Link>
      </div>
    </div>
  );
}
