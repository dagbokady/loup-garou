import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLES } from '@shared/roles';
import type { PlayerView, RoleId } from '@shared/types';
import { RoleArt } from './RoleArt';

const seenKey = (k: string) => `lg-seen:${k}`;
const wasSeen = (k: string) => { try { return sessionStorage.getItem(seenKey(k)) === '1'; } catch { return false; } };
const markSeen = (k: string) => {
  try { sessionStorage.setItem(seenKey(k), '1'); } catch { /* stockage indisponible */ }
  window.dispatchEvent(new Event(CINE_EVENT));
};
const CINE_EVENT = 'lg-cine-closed';

/**
 * Vrai tant que la mort de ce joueur n'a pas encore été annoncée sur son écran
 * (scène de l'aube ou du verdict pas encore jouée) : il ne doit pas l'apprendre avant les autres.
 */
export function useOwnDeathPending(view: PlayerView | null): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    window.addEventListener(CINE_EVENT, f);
    return () => window.removeEventListener(CINE_EVENT, f);
  }, []);
  if (!view || view.me.alive || view.game.status !== 'running') return false;
  const run = `${view.game.code}-${view.game.startedAt}`;
  const { dawn, verdict, me } = view;
  if (dawn && dawn.deaths.some((d) => d.id === me.id) && !wasSeen(`${run}:aube:${dawn.day}`)) return true;
  if (verdict && (verdict.name === me.name || verdict.lover?.name === me.name) && !wasSeen(`${run}:verdict:${verdict.id}`)) return true;
  return false;
}

/** Fond de la place du vote (urne sous la lune), posé derrière le contenu. */
export function VoteBackdrop() {
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[-5] overflow-hidden">
      <img src="/assets/fond-vote.webp" alt="" className="vote-bg absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-b from-nuit-950/40 via-nuit-950/50 to-nuit-950/90" />
      <div className="absolute inset-0" style={{ boxShadow: 'inset 0 0 160px 40px rgba(5,7,20,0.9)' }} />
    </div>,
    document.body,
  );
}

/** Scènes plein écran : bilan de l'aube, puis révélation du joueur désigné par le vote. */
export function Cinematics({ view }: { view: PlayerView }) {
  const run = `${view.game.code}-${view.game.startedAt}`;
  const dawnKey = view.dawn ? `${run}:aube:${view.dawn.day}` : null;
  const verdictKey = view.verdict ? `${run}:verdict:${view.verdict.id}` : null;
  const duskKey = view.game.phase === 'night' && !view.game.revealing ? `${run}:nuit:${view.game.nightNumber}` : null;
  const [ready, setReady] = useState(false);
  const [, force] = useState(0);
  // Laisse passer le voile de transition jour/nuit avant de jouer une scène.
  useEffect(() => { setReady(false); const t = setTimeout(() => setReady(true), 1700); return () => clearTimeout(t); }, [dawnKey, duskKey]);

  const close = (k: string) => { markSeen(k); force((n) => n + 1); };
  if (dawnKey && !wasSeen(dawnKey)) return ready ? <Dawn view={view} onClose={() => close(dawnKey)} /> : null;
  if (verdictKey && !wasSeen(verdictKey)) return <Verdict verdict={view.verdict!} onClose={() => close(verdictKey)} />;
  if (duskKey && !wasSeen(duskKey)) return ready ? <Dusk night={view.game.nightNumber} onClose={() => close(duskKey)} /> : null;
  return null;
}

/**
 * Tombée de la nuit, en miroir du lever du jour : le village sous le soleil couchant,
 * puis la nuit l'envahit (image de nuit, lune), avant de rendre la main à l'écran de jeu.
 */
function Dusk({ night, onClose }: { night: number; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(() => { onClose(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, DUSK_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="cine cine-daybreak" role="dialog" aria-modal>
      <div className="daybreak-scene">
        <img src="/assets/fond-jour.webp" alt="" className="dusk-day" />
        <div className="dusk-sun" />
        <img src="/assets/fond-nuit.webp" alt="" className="dusk-night" />
        <div className="dusk-moon" />
      </div>
      <div className="daybreak-shade daybreak-shade-on" />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-4 text-center">
        <p className="cine-in text-xs uppercase tracking-[0.5em] text-mystic-400" style={{ animationDelay: '2600ms' }}>Nuit {night}</p>
        <h2 className="cine-in mt-2 font-title text-4xl text-gold drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] sm:text-5xl" style={{ animationDelay: '3100ms' }}>La nuit tombe</h2>
        <p className="cine-in mt-2 text-parchemin-50 drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]" style={{ animationDelay: '3800ms' }}>sur Thiercelune… Fermez les yeux.</p>
      </div>
    </div>,
    document.body,
  );
}
const DUSK_MS = 7500;

function Stage({ children, tone }: { children: React.ReactNode; tone: 'dawn' | 'verdict' }) {
  return createPortal(
    <div className={`cine cine-${tone}`} role="dialog" aria-modal>
      <div className="cine-bg" />
      <div className="cine-grain" />
      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-4 text-center">{children}</div>
    </div>,
    document.body,
  );
}

function RoleReveal({ roleId, delay }: { roleId: RoleId | null; delay: number }) {
  const role = roleId ? ROLES[roleId] : null;
  return (
    <div className="cflip mt-6" style={{ animationDelay: `${delay}ms` }}>
      <div className="cflip-inner" style={{ animationDelay: `${delay}ms` }}>
        <img src="/assets/dos-carte.webp" alt="" className="cflip-face rounded-xl" />
        <div className="cflip-face cflip-back overflow-hidden rounded-xl ring-2 ring-or-300/70">
          {role ? <RoleArt roleId={role.id} label={false} className="h-full w-full" /> : <div className="flex h-full items-center justify-center bg-nuit-900 p-3 text-sm text-parchemin-300">Rôle gardé secret</div>}
        </div>
      </div>
      {role && <p className="cine-in mt-3 font-title text-2xl tracking-wider text-gold" style={{ animationDelay: `${delay + 700}ms` }}>{role.name}</p>}
    </div>
  );
}

/**
 * Lever du jour : tout s'efface, le village apparaît sous le soleil levant,
 * puis — après un court suspense — le bilan de la nuit. On revient ensuite au jour (vote).
 */
function Dawn({ view, onClose }: { view: PlayerView; onClose: () => void }) {
  const { day, deaths } = view.dawn!;
  const [step, setStep] = useState<'sunrise' | 'suspense' | 'reveal'>('sunrise');
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setStep('suspense'), 7000);
    const t2 = setTimeout(() => setStep('reveal'), 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);
  // Une carte à la fois, enchaînées sans long temps mort.
  useEffect(() => {
    if (step !== 'reveal' || idx >= deaths.length) return;
    const t = setTimeout(() => setIdx((i) => i + 1), CARD_MS);
    return () => clearTimeout(t);
  }, [step, idx, deaths.length]);
  const finish = () => { onClose(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  // Pas de bouton : une fois les victimes dévoilées, on rejoint la place du village tout seul.
  useEffect(() => {
    if (step !== 'reveal') return;
    const t = setTimeout(finish, (deaths.length ? deaths.length * CARD_MS : 4000) + (deaths.some((d) => d.wasChief) ? 4000 : 0));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return createPortal(
    <div className="cine cine-daybreak" role="dialog" aria-modal>
      {/* Le village sous le jour qui se lève */}
      <div className="daybreak-scene">
        <img src="/assets/fond-jour.webp" alt="" className="daybreak-img" />
        <div className="daybreak-sun" />
        <div className="daybreak-rays" />
        <div className="daybreak-mist" />
        <div className="daybreak-night" />
      </div>
      <div className={`daybreak-shade ${step !== 'sunrise' ? 'daybreak-shade-on' : ''}`} />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center px-4 text-center">
        {step === 'sunrise' && (
          <div key="sunrise" className="daybreak-title">
            <p className="cine-in text-xs uppercase tracking-[0.5em] text-or-100/90" style={{ animationDelay: '1400ms' }}>Jour {day}</p>
            <h2 className="cine-in mt-2 font-title text-4xl text-gold drop-shadow-[0_2px_12px_rgba(0,0,0,.8)] sm:text-5xl" style={{ animationDelay: '2000ms' }}>Le jour se lève</h2>
            <p className="cine-in mt-2 text-parchemin-50 drop-shadow-[0_2px_8px_rgba(0,0,0,.9)]" style={{ animationDelay: '2800ms' }}>sur Thiercelune…</p>
          </div>
        )}
        {step === 'suspense' && (
          <div key="suspense" className="flex flex-col items-center">
            <p className="cine-in cine-heart text-lg text-parchemin-100">Les villageois sortent un à un…</p>
            <p className="cine-in mt-2 text-parchemin-300" style={{ animationDelay: '600ms' }}>Mais tout le monde a-t-il survécu à la nuit ?</p>
            {/* Le dos de la carte apparaît sur chaque téléphone avant l'annonce. */}
            <div className="cine-in mt-6" style={{ animationDelay: '1200ms' }}>
              <img src="/assets/dos-carte.webp" alt="" className="h-[13rem] w-[9rem] rounded-xl object-cover shadow-[0_20px_60px_rgba(0,0,0,.6),0_0_40px_rgba(233,201,111,.25)]" />
            </div>
          </div>
        )}
        {step === 'reveal' && (
          <div key="reveal" className="flex w-full flex-col items-center">
            {deaths.length === 0 ? (
              <>
                <p className="cine-in text-xs uppercase tracking-[0.4em] text-or-200/80">Soulagement</p>
                <p className="cine-in mt-3 font-title text-3xl text-gold" style={{ animationDelay: '300ms' }}>Personne n’est mort cette nuit.</p>
              </>
            ) : idx < deaths.length ? (
              <DeathCard key={deaths[idx].id} death={deaths[idx]} index={idx} total={deaths.length} />
            ) : (
              deaths.some((d) => d.wasChief) && (
                <p className="cine-in font-title text-lg text-gold">Le Chef du village est mort : il doit désigner son successeur avant le vote.</p>
              )
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

const CARD_MS = 4200;

/** Dos de carte qui se retourne sur la carte du mort, son pseudo en dessous. */
function DeathCard({ death, index, total }: { death: NonNullable<PlayerView['dawn']>['deaths'][number]; index: number; total: number }) {
  const role = death.roleId ? ROLES[death.roleId] : null;
  return (
    <div className="flex flex-col items-center">
      <p className="text-xs uppercase tracking-[0.4em] text-parchemin-300">{total > 1 ? `Victime ${index + 1} / ${total}` : 'Cette nuit, une victime'}</p>
      <div className="mt-4" style={{ perspective: '1000px' }}>
        <div className="cflip-inner" style={{ animationDelay: '200ms' }}>
          <img src="/assets/dos-carte.webp" alt="" className="cflip-face rounded-xl" />
          <div className="cflip-face cflip-back overflow-hidden rounded-xl ring-2 ring-sang-500/70">
            {role ? <RoleArt roleId={role.id} label={false} className="h-full w-full grayscale-[30%]" /> : <div className="flex h-full items-center justify-center bg-nuit-900 p-3 text-sm text-parchemin-300">Rôle gardé secret</div>}
          </div>
        </div>
      </div>
      <p className="cine-in mt-4 max-w-full break-words font-title text-3xl text-parchemin-50" style={{ animationDelay: '1000ms' }}>{death.name}</p>
      <p className="cine-in text-sm text-red-300" style={{ animationDelay: '1300ms' }}>{role ? role.name : 'Rôle inconnu'}</p>
      {death.loverOf && <p className="cine-in mt-1 text-sm text-pink-300" style={{ animationDelay: '1600ms' }}>💔 Lié(e) par Cupidon à {death.loverOf}, mort(e) de chagrin</p>}
      {death.wasChief && <p className="cine-in mt-1 text-sm text-or-200" style={{ animationDelay: '1600ms' }}>👑 Chef du village</p>}
    </div>
  );
}

function Verdict({ verdict, onClose }: { verdict: NonNullable<PlayerView['verdict']>; onClose: () => void }) {
  // Révélation lente, puis fermeture automatique.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(onClose, verdict.lover ? 22000 : 15000); return () => clearTimeout(t); }, []);
  return (
    <Stage tone="verdict">
      <p className="cine-in cine-heart text-sm uppercase tracking-[0.4em] text-parchemin-300">Le village a tranché…</p>
      <span className="suspense-dots mt-6" aria-hidden><i /><i /><i /></span>
      <h2 className="cine-slam mt-4 max-w-full break-words font-title text-4xl text-parchemin-50 sm:text-5xl" style={{ animationDelay: '5000ms' }}>{verdict.name}</h2>
      <p className="cine-in mt-2 text-red-300" style={{ animationDelay: '6500ms' }}>est éliminé(e) par le vote</p>
      <RoleReveal roleId={verdict.roleId} delay={8500} />
      {verdict.lover && <>
        <p className="cine-in mt-6 text-pink-300" style={{ animationDelay: '11500ms' }}>💔 {verdict.name} était lié(e) par Cupidon à</p>
        <h3 className="cine-slam mt-1 font-title text-3xl text-parchemin-50" style={{ animationDelay: '12500ms' }}>{verdict.lover.name}</h3>
        <p className="cine-in mt-1 text-red-300" style={{ animationDelay: '13300ms' }}>qui meurt de chagrin</p>
        <RoleReveal roleId={verdict.lover.roleId} delay={14500} />
      </>}
    </Stage>
  );
}
