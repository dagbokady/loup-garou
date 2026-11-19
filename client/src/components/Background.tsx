import { lazy, Suspense } from 'react';

// Three.js est chargé à part : la page s'affiche immédiatement, l'ambiance arrive ensuite.
const Atmosphere = lazy(() => import('./Atmosphere'));

/** Fond immersif : village de nuit (lune, forêt) ou de jour, avec fondu enchaîné et ambiance 3D. */
export function Background({ mode }: { mode: 'day' | 'night' }) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-nuit-950">
      <img
        src="/assets/fond-nuit.webp"
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ${mode === 'night' ? 'opacity-100' : 'opacity-0'}`}
      />
      <img
        src="/assets/fond-jour.webp"
        alt=""
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ${mode === 'day' ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`absolute inset-0 transition-colors duration-[1500ms] ${
          mode === 'night'
            ? 'bg-gradient-to-b from-nuit-950/30 via-nuit-950/55 to-nuit-950/90'
            : 'bg-gradient-to-b from-nuit-950/5 via-nuit-950/40 to-nuit-950/85'
        }`}
      />
      <Suspense fallback={null}>
        <Atmosphere mode={mode} />
      </Suspense>
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 180px 40px rgba(5,7,20,0.85)' }} />
    </div>
  );
}
