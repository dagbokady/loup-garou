import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ROLES, ROLE_ORDER } from '@shared/roles';
import { Background } from '../components/Background';
import { Grimoire } from '../components/Grimoire';
import { RoleArt } from '../components/RoleArt';
import { storage } from '../lib/storage';

/** Page d'accueil immersive. */
export function Home() {
  const [grimoire, setGrimoire] = useState(false);
  const playerSession = storage.getPlayer();
  const showcase = ROLE_ORDER.filter((id) => ROLES[id].image);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Background mode="night" />

      <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-4 pb-16 pt-12 text-center sm:pt-20">
        <p className="animate-rise font-title text-xs uppercase tracking-[0.5em] text-or-300/90">Les chroniques de Thiercelune</p>
        <h1 className="mt-3 animate-rise font-display text-5xl font-black leading-tight text-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.9)] sm:text-7xl">
          Loup-Garou
        </h1>
        <div className="ornament animate-rise">☾ ✦ ☽</div>
        <p className="max-w-xl animate-rise text-lg text-parchemin-100 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] sm:text-xl">
          Quand la lune se lève sur le village, les ombres s’éveillent. Rassemblez vos amis, recevez votre rôle en secret et
          démasquez les bêtes qui rôdent parmi vous.
        </p>

        <div className="mt-10 grid w-full max-w-2xl animate-rise gap-4 sm:grid-cols-2">
          <Link to="/jouer" className="panel group block p-6 text-left transition hover:-translate-y-1 hover:shadow-glow">
            <div className="text-3xl">🌕</div>
            <h2 className="mt-2 font-title text-xl font-bold text-or-200">Rejoindre une partie</h2>
            <p className="mt-1 text-parchemin-200">Saisissez le code donné par le Maître du jeu et choisissez votre pseudonyme. Aucun compte nécessaire.</p>
            <span className="btn-gold mt-4 w-full">Entrer au village</span>
          </Link>
          <Link to="/mj" className="panel group block p-6 text-left transition hover:-translate-y-1 hover:shadow-glow-violet">
            <div className="text-3xl">📜</div>
            <h2 className="mt-2 font-title text-xl font-bold text-or-200">Espace du Maître du jeu</h2>
            <p className="mt-1 text-parchemin-200">Créez la partie, distribuez les rôles, orchestrez les nuits, les jours et les votes.</p>
            <span className="btn-violet mt-4 w-full">Prendre la plume</span>
          </Link>
        </div>

        {playerSession && (
          <Link to="/jouer/partie" className="mt-4 text-or-200 underline decoration-or-500/50 underline-offset-4 hover:text-or-100">
            Reprendre ma partie en cours ({playerSession.name} · {playerSession.code})
          </Link>
        )}

        <button onClick={() => setGrimoire(true)} className="group mt-14 flex flex-col items-center">
          <img src="/assets/grimoire.webp" alt="" className="w-44 animate-float drop-shadow-[0_0_30px_rgba(124,77,204,0.7)] transition group-hover:scale-105" />
          <span className="btn-ghost mt-2">Ouvrir le Grimoire</span>
        </button>

        <section className="mt-14 w-full">
          <h2 className="panel-title mx-auto max-w-lg">Les habitants de Thiercelune</h2>
          <div className="mt-6 flex snap-x gap-4 overflow-x-auto px-2 pb-4">
            {showcase.map((id) => (
              <figure key={id} className="w-32 shrink-0 snap-center sm:w-40">
                <div className="overflow-hidden rounded-xl border border-or-500/60 shadow-lg transition hover:-translate-y-1 hover:shadow-glow">
                  <RoleArt roleId={id} className="aspect-[2/3] w-full" />
                </div>
              </figure>
            ))}
          </div>
        </section>
      </main>
      <Grimoire open={grimoire} onClose={() => setGrimoire(false)} />
    </div>
  );
}
