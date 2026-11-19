import { useState } from 'react';
import { ROLES } from '@shared/roles';
import { Drawer } from '../../components/Drawer';
import { Icon } from '../../components/Icon';
import type { GmApi, GmView } from '../../lib/useGm';
import { DayDesk } from './DayDesk';
import { EndGameModal } from './EndGameModal';
import { EventBook } from './EventBook';
import { NightDesk } from './NightDesk';
import { RevealDesk } from './RevealDesk';
import { VillageMap } from './VillageMap';

/**
 * Table du MJ pendant la partie, pensée comme un jeu :
 * la Scène au centre déroule la partie étape par étape (nuit, appels, bilan, jour, vote),
 * le Village à côté permet d'agir sur chaque joueur.
 */
export function RunningTable({ gm, game, openGrimoire }: { gm: GmApi; game: GmView; openGrimoire: () => void }) {
  const [tab, setTab] = useState<'scene' | 'village'>('scene');
  const [ending, setEnding] = useState(false);
  const [book, setBook] = useState(false);
  const night = game.phase === 'night';

  return (
    <div className="animate-rise">
      <StatusBar game={game} onEnd={() => setEnding(true)} onBook={() => setBook(true)} />

      <div className="mt-4 grid grid-cols-1 gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className={`${tab === 'scene' ? '' : 'hidden'} lg:block`}>
          <PendingTriggers gm={gm} game={game} />
          <div key={`${game.phase}-${night ? game.nightNumber : game.dayNumber}-${game.revealing ? 'r' : ''}`} className="stage-in">
            {game.revealing ? <RevealDesk gm={gm} game={game} /> : night ? <NightDesk gm={gm} game={game} /> : <DayDesk gm={gm} game={game} />}
          </div>
        </section>
        <div className={`${tab === 'village' ? '' : 'hidden'} lg:block`}>
          <VillageMap gm={gm} game={game} />
        </div>
      </div>

      {/* Navigation mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-or-500/40 bg-nuit-950/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {(
          [
            [night ? 'moon' : 'sun', 'Scène', () => setTab('scene'), tab === 'scene'],
            ['users', 'Village', () => setTab('village'), tab === 'village'],
            ['scroll', 'Livre', () => setBook(true), false],
            ['book', 'Grimoire', openGrimoire, false],
          ] as [string, string, () => void, boolean][]
        ).map(([icon, label, fn, on]) => (
          <button key={label} onClick={fn} className={`relative flex flex-col items-center gap-1 py-2 font-title text-[10px] uppercase tracking-wider transition ${on ? 'text-or-200' : 'text-parchemin-300/60'}`}>
            {on && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-or-300 shadow-glow" />}
            <Icon name={icon} className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>

      <Drawer open={book} onClose={() => setBook(false)} title="Le Livre des événements">
        <EventBook game={game} />
      </Drawer>
      <EndGameModal open={ending} onClose={() => setEnding(false)} gm={gm} game={game} />
    </div>
  );
}

/** Bandeau d'état : phase, joueurs en vie, code, accès rapides. */
function StatusBar({ game, onEnd, onBook }: { game: GmView; onEnd: () => void; onBook: () => void }) {
  const night = game.phase === 'night';
  const alive = game.players.filter((p) => p.alive).length;
  const met = game.victoryChecks.filter((c) => c.met);
  return (
    <section className="frame flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full ring-1 ${night ? 'bg-mystic-800/70 text-mystic-400 ring-mystic-500/50' : 'bg-or-400/15 text-or-300 ring-or-400/50'}`}>
          <Icon name={night ? 'moon' : 'sun'} className={`h-6 w-6 ${night ? 'moon-glow' : 'sun-glow'}`} />
        </span>
        <div>
          <div className="font-display text-xl leading-none text-gold sm:text-2xl">{night ? `Nuit ${game.nightNumber}` : `Jour ${game.dayNumber}`}</div>
          <div className="mt-1 flex items-center gap-3 text-xs text-parchemin-300/80">
            <span className="inline-flex items-center gap-1"><Icon name="users" className="h-3.5 w-3.5" />{alive}/{game.players.length}</span>
            <span className="inline-flex items-center gap-1 font-mono tracking-widest"><Icon name="link" className="h-3.5 w-3.5" />{game.code}</span>
          </div>
        </div>
      </div>

      {met.length > 0 && (
        <button onClick={onEnd} className="chip animate-pulse bg-or-400/20 px-3 py-1 text-xs text-or-100 ring-1 ring-or-300">
          <Icon name="scale" className="h-3.5 w-3.5" /> Victoire possible : {met.map((m) => m.label).join(', ')}
        </button>
      )}

      <div className="ml-auto flex items-center gap-2">
        <button className="icon-btn hidden lg:inline-flex" onClick={onBook} title="Livre des événements"><Icon name="scroll" /></button>
        <button className="btn-ghost btn-sm ring-1 ring-sang-500/40" onClick={onEnd}><Icon name="flag" className="h-3.5 w-3.5" />Fin de partie</button>
      </div>
    </section>
  );
}

/** Conséquences à résoudre : tir du Chasseur, mort de chagrin, succession du Chef. */
function PendingTriggers({ gm, game }: { gm: GmApi; game: GmView }) {
  if (!game.pendingTriggers.length) return null;
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? '—';
  return (
    <div className="mb-4 space-y-3">
      {game.pendingTriggers.map((t) => (
        <div key={t.id} className="frame frame-blood frame-live stage-in p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sang-600/40 text-red-200 ring-1 ring-sang-500">
              <Icon name={t.type === 'lover' ? 'heartCrack' : t.type === 'hunter' ? 'target' : 'crown'} className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="frame-title !text-red-200/80">Conséquence à résoudre</p>
              <p className="mt-1 text-or-100">
                {t.type === 'lover' ? (
                  <>{name(t.playerId)} est mort(e) : {name(t.partnerId)} meurt de chagrin.</>
                ) : t.type === 'hunter' ? (
                  <>{name(t.playerId)} ({ROLES.chasseur.name}) désigne un joueur qui meurt avec lui.</>
                ) : (
                  <>{name(t.playerId)} était Chef du village : il/elle désigne son successeur.</>
                )}
              </p>
            </div>
          </div>
          {t.type === 'lover' ? (
            <div className="mt-3 flex gap-2">
              <button className="btn-danger btn-sm" onClick={() => gm.act('resolveTrigger', { triggerId: t.id, targetId: t.partnerId })}><Icon name="check" className="h-3.5 w-3.5" />Confirmer</button>
              <button className="btn-ghost btn-sm" onClick={() => gm.act('resolveTrigger', { triggerId: t.id, targetId: null })}>Ignorer</button>
            </div>
          ) : t.type === 'hunter' && game.phase !== 'day' ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-or-200"><Icon name="sun" className="h-4 w-4" />Il tirera au lever du jour, une fois les morts annoncés.</p>
          ) : t.type === 'hunter' ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-sm text-or-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />Le Chasseur choisit sa cible sur son téléphone…</p>
              <button className="btn-ghost btn-sm" title="Si le Chasseur ne peut pas jouer" onClick={() => gm.act('resolveTrigger', { triggerId: t.id, targetId: null })}>Ne pas tirer</button>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="flex items-center gap-1.5 text-sm text-or-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />L’ancien Chef choisit son successeur sur son téléphone…</p>
              <button className="btn-ghost btn-sm" title="Si l’ancien Chef ne peut pas jouer" onClick={() => gm.act('resolveTrigger', { triggerId: t.id, targetId: null })}>Plus tard</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
