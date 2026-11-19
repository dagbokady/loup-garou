import { DebateClock } from '../../components/DebateClock';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLES } from '@shared/roles';
import type { PlayerView } from '@shared/types';
import { Background } from '../../components/Background';
import { Cinematics, VoteBackdrop, useOwnDeathPending } from '../../components/Cinematics';
import { RoleSheetView } from '../../components/Grimoire';
import { Icon } from '../../components/Icon';
import { Confirm, Modal } from '../../components/Modal';
import { RoleCard } from '../../components/RoleCard';
import { RoleArt } from '../../components/RoleArt';
import { SeerReveal, VisionLog } from '../../components/SeerVision';
import { useVeil } from '../../components/Veil';
import { TableScene, seatPosition, seatSize } from '../../components/TableScene';
import { fmtTime } from '../../lib/api';
import { emit } from '../../lib/socket';
import { usePlayer } from '../../lib/usePlayer';
import { useToast } from '../../lib/toast';

/** Espace personnel du joueur, minimaliste : une seule chose à l'écran. */
export function PlayerSpace() {
  const nav = useNavigate();
  const { session, view, error, kicked, replaced, connected, send, leave, resume } = usePlayer();
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!session) nav('/jouer', { replace: true });
  }, [session, nav]);

  const phaseKey = view ? `${view.game.phase}-${view.game.dayNumber}-${view.game.nightNumber}-${view.game.revealing ? 'r' : ''}` : '';
  const veilText = view?.game.revealing
    ? 'Découvrez votre carte…'
    : view?.game.phase === 'night'
    ? `La nuit ${view.game.nightNumber} tombe sur le village…`
    : view?.game.phase === 'day' ? 'Le jour se lève…' : '';
  const veil = useVeil(phaseKey, veilText, !!view && view.game.status === 'running' && (view.game.phase === 'night' || view.game.phase === 'day'));
  // Sa propre mort reste cachée tant que l'annonce (aube ou verdict) n'a pas été jouée sur son écran.
  const deathPending = useOwnDeathPending(view);

  if (replaced) return (
    <Centered>
      <h1 className="text-2xl text-gold">Session ouverte ailleurs</h1>
      <p className="mt-2 text-parchemin-200">Votre place a été reprise sur un autre appareil.</p>
      <button className="btn-gold mt-5" onClick={resume}>Reprendre ici</button>
    </Centered>
  );
  if (kicked || error) return (
    <Centered>
      <h1 className="text-2xl text-gold">{kicked ? 'Vous avez été retiré(e)' : 'Session introuvable'}</h1>
      <p className="mt-2 text-parchemin-200">{kicked ? 'Le Maître du jeu vous a retiré(e) de la partie.' : error}</p>
      <button className="btn-gold mt-5" onClick={() => { leave(); nav('/jouer'); }}>Rejoindre</button>
    </Centered>
  );
  if (!view) return <Centered><p className="text-parchemin-200">Chargement…</p></Centered>;

  const { game } = view;
  const me = deathPending ? { ...view.me, alive: true } : view.me;
  const mode = game.phase === 'day' || game.phase === 'ended' ? 'day' : 'night';

  return (
    <div className="min-h-screen pb-10">
      <Background mode={mode} />
      {veil}
      {view.game.status === 'running' && <Cinematics view={view} />}
      <header className="sticky top-0 z-20 bg-nuit-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center gap-2 px-4 py-2">
          <Icon name={game.phase === 'night' ? 'moon' : game.phase === 'day' ? 'sun' : 'flag'} className={`h-6 w-6 ${game.phase === 'night' ? 'text-mystic-400' : 'text-or-300'}`} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 truncate text-sm font-medium">{me.isChief && <Icon name="crown" className="h-3.5 w-3.5 text-or-300" />}{me.name}{me.lover && <Icon name="heart" className="h-3.5 w-3.5 text-pink-400" />}{!me.alive && <Icon name="skull" className="h-3.5 w-3.5 text-red-300" />}</div>
            <div className="text-[11px] uppercase tracking-wider text-parchemin-300/60">{phaseLabel(view)}</div>
          </div>
          {!connected && <span className="chip bg-sang-500/20 text-red-300">Reconnexion…</span>}
          {game.status === 'running' && !game.revealing && me.roleId && <MyCardButton view={deathPending ? { ...view, me } : view} />}
          <button className="btn-ghost btn-sm" onClick={() => setLeaving(true)}>Quitter</button>
        </div>
      </header>

      <main className="mx-auto mt-4 max-w-xl animate-rise px-4">
        {game.status === 'lobby' ? <Lobby view={view} />
          : game.status === 'cancelled' ? (
            <div className="panel p-6 text-center">
              <h2 className="text-2xl text-gold">Partie annulée</h2>
              <Link to="/" className="btn-gold mt-4 inline-flex" onClick={leave}>Retour</Link>
            </div>
          ) : game.status === 'ended' ? <Ending view={view} onLeave={leave} />
          : <GameUI view={deathPending ? { ...view, me, hunter: null, succession: null } : view} send={send} />}
      </main>

      <Confirm open={leaving} onClose={() => setLeaving(false)} title="Quitter cet appareil ?" message="Votre jeton sera oublié." confirmLabel="Quitter" danger onConfirm={() => { leave(); nav('/'); }} />
    </div>
  );
}

function GameUI({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const { game, me, action, wolfChat, vote } = view;
  if (view.hunter) return <HunterPanel view={view} send={send} />;
  if (view.succession) return <SuccessionPanel view={view} send={send} />;
  if (!me.alive) return <DeadView view={view} send={send} />;
  if (game.phase === 'day' && view.successionWaiting && vote?.status !== 'open') return (
    <div className="frame stage-in p-6 text-center">
      <Icon name="crown" className="mx-auto h-10 w-10 text-or-300" />
      <h2 className="mt-2 font-display text-2xl text-gold">Le Chef du village est mort</h2>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-parchemin-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />{view.successionWaiting} désigne son successeur avant le vote…</p>
    </div>
  );
  if (game.revealing) return <RevealPanel view={view} send={send} />;
  if (action?.kind === 'pack' && game.phase === 'night') return <PackPanel view={view} send={send} />;
  if (action && game.phase === 'night') return <ActionPanel view={view} />;
  if (wolfChat?.open && game.phase === 'night') return <WolfChatPanel view={view} send={send} />;
  if (vote?.status === 'open' || (vote?.status === 'closed' && vote.published)) return <VotePanel view={view} send={send} />;
  if (game.phase === 'night') return <SleepingPanel view={view} />;
  return <DayPanel view={view} />;
}

/** Période de révélation : chacun retourne sa carte autant qu'il veut, sans limite de temps. */
function RevealPanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const [revealed, setRevealed] = useState(false);
  const [told, setTold] = useState(false);
  const toggle = () => {
    setRevealed((r) => !r);
    if (!told) { setTold(true); void send('player:sawCard', {}); }
  };
  return (
    <div className="space-y-4 text-center animate-rise">
      <div className="panel p-4">
        <p className="text-xs uppercase tracking-[0.3em] text-or-300/80">Révélation</p>
        <h2 className="mt-1 text-2xl text-gold">Découvrez votre rôle</h2>
        <p className="mt-1 text-sm text-parchemin-200">Touchez la carte pour la retourner, aussi souvent que vous voulez. Ensuite, seule la table du village s’affichera : le bouton « Ma carte » en haut de l’écran vous permettra de la revoir.</p>
      </div>
      <RoleCard roleId={view.me.roleId} revealed={revealed} onToggle={toggle} lover={view.me.lover} />
      {view.me.campNote && revealed && <p className="text-sm text-or-200">{view.me.campNote}</p>}
      <p className="flex items-center justify-center gap-1.5 text-sm text-parchemin-300/80"><Icon name="info" className="h-4 w-4" />Le Maître du jeu lancera la première nuit.</p>
    </div>
  );
}

/** Bouton discret pour revoir sa carte (face cachée à l'ouverture, retournable d'un toucher). */
function MyCardButton({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const close = () => { setOpen(false); setRevealed(false); };
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Voir ma carte"><Icon name="eye" className="h-3.5 w-3.5" /><span className="hidden min-[360px]:inline">Ma carte</span></button>
      <Modal open={open} onClose={close} title="Ma carte">
        <RoleCard roleId={view.me.roleId} revealed={revealed} onToggle={() => setRevealed((r) => !r)} lover={view.me.lover} dead={!view.me.alive} />
        {view.me.campNote && revealed && <p className="mt-3 text-center text-sm text-or-200">{view.me.campNote}</p>}
        <button className="btn-gold mx-auto mt-4 flex" onClick={close}>Fermer</button>
      </Modal>
    </>
  );
}

/** La nuit, un joueur qui n'est pas appelé dort : seule la table du village reste à l'écran. */
function SleepingPanel({ view }: { view: PlayerView }) {
  return (
    <div className="space-y-4 text-center animate-rise">
      <p className="text-parchemin-300/80">Fermez les yeux… Le village sombre dans la nuit.</p>
      <Village view={view} />
      {view.me.whispers.length > 0 && <Whispers view={view} />}
      <VisionLog visions={view.me.visions} />
    </div>
  );
}

function DayPanel({ view }: { view: PlayerView }) {
  return (
    <div className="space-y-4 animate-rise">
      <DebateClock debate={view.game.debate} />
      {view.bavard?.pending && (
        <p className="panel flex items-center gap-2 p-3 text-sm text-or-200"><Icon name="info" className="h-4 w-4 shrink-0" />
          Au prochain vote du village, le vote de {view.bavard.pending.voterName} sera {view.bavard.pending.effect === 'annuler' ? 'annulé' : `redirigé vers ${view.bavard.pending.redirectName}`}.
        </p>
      )}
      <Village view={view} />
      {view.me.whispers.length > 0 && <Whispers view={view} />}
      <VisionLog visions={view.me.visions} />
      <Charmed view={view} />
    </div>
  );
}

/** Mode spectateur : un joueur éliminé suit la partie sans voir les rôles encore cachés. */
function DeadView({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const { game, vote } = view;
  const night = game.phase === 'night';
  const events = view.publicEvents.slice(-8).reverse();
  return (
    <div className="space-y-4 text-center">
      <div className="panel p-5">
        <p className="flex items-center justify-center gap-2 text-xl text-red-300"><Icon name="skull" className="h-6 w-6" />Vous avez été éliminé(e)</p>
        <p className="mt-1 text-sm text-parchemin-200">Mode spectateur : suivez la partie en silence, sans rien révéler.</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1 text-sm text-or-200 ring-1 ring-or-500/25">
          <Icon name={night ? 'moon' : 'sun'} className="h-4 w-4" />{night ? `Nuit ${game.nightNumber} : le village dort` : `Jour ${game.dayNumber}`}
        </p>
      </div>
      {!night && <DebateClock debate={game.debate} />}
      {(vote?.status === 'open' || (vote?.status === 'closed' && vote.published)) && <VoteInner view={view} send={send} />}
      <RoleCard roleId={view.me.roleId} revealed dead lover={view.me.lover} />
      <Village view={view} />
      {events.length > 0 && (
        <div className="panel p-4 text-left">
          <p className="mb-2 text-xs uppercase tracking-[0.3em] text-or-300/80">Chronique du village</p>
          <ul className="space-y-1.5 text-sm text-parchemin-200">
            {events.map((e) => <li key={e.id} className="border-l-2 border-or-500/30 pl-2">{e.text}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionPanel({ view }: { view: PlayerView }) {
  const a = view.action!;
  const [targets, setTargets] = useState<string[]>([]);
  const [choice, setChoice] = useState('');
  const [heal, setHeal] = useState('');
  const [poison, setPoison] = useState('');
  const [dest, setDest] = useState<string[]>([]);
  const [sent, setSent] = useState(a.recorded);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const roleName = view.me.roleId ? ROLES[view.me.roleId].name : '';
  const title = a.key === 'loups' ? 'La meute choisit sa proie' : `${roleName}`;

  const submit = async () => {
    const act: Record<string, unknown> = {};
    if (a.kind === 'target') { if (!targets[0]) return; act.targets = targets; }
    else if (a.kind === 'targets') { if (!targets.length) return; act.targets = targets; }
    else if (a.kind === 'choice') { if (!choice) return; act.choice = choice; act.targets = []; }
    else if (a.kind === 'bavard') {
      if (!choice) return;
      if (choice !== 'passer' && !targets[0]) return;
      if (choice === 'rediriger' && !dest[0]) return;
      act.choice = choice;
      act.targets = choice === 'passer' ? [] : choice === 'annuler' ? [targets[0]] : [targets[0], dest[0]];
    }
    else if (a.kind === 'witch') { act.heal = heal || null; act.poison = poison || null; act.targets = []; }
    if (busy) return;
    setBusy(true);
    try { await emit('player:action', { key: a.key, action: act }); setSent(true); }
    catch (e) { toast((e as Error).message, 'error'); }
    finally { setBusy(false); }
  };

  // La Voyante découvre la carte immédiatement, sans attendre le lever du jour.
  const vision = a.key === 'voyante' ? view.me.visions.find((v) => v.night === view.game.nightNumber) : undefined;
  if ((sent || a.recorded) && vision) return <SeerReveal vision={vision} />;

  if (sent || a.recorded) return (
    <div className="panel p-6 text-center animate-rise">
      <Icon name="check" className="pop-in mx-auto h-10 w-10 text-foret-400" strokeWidth={2.5} />
      <p className="mt-2 text-lg text-or-200">Votre choix est transmis</p>
      <p className="mt-2 text-parchemin-200">Fermez les yeux et attendez le réveil suivant.</p>
    </div>
  );

  return (
    <div className="space-y-4 animate-rise">
      <AwakeCard view={view} />
      <div className="panel p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-parchemin-300/70">Votre pouvoir</p>
        <h2 className="mt-1 text-2xl text-gold">{title}</h2>
        {a.note && <p className="mt-2 text-sm text-parchemin-200">{a.note}</p>}
      </div>

      {a.kind === 'target' && <Picker items={a.candidates} value={targets} onChange={setTargets} max={1} />}
      {a.kind === 'targets' && (
        <>
          <p className="text-center text-sm text-parchemin-300">
            {a.key === 'cupidon' ? 'Choisissez deux amoureux (vous pouvez vous choisir)' : `Jusqu’à ${a.max ?? 2} personnes`}
          </p>
          <Picker items={a.candidates} value={targets} onChange={setTargets} max={a.max ?? 2} />
        </>
      )}
      {a.kind === 'choice' && (
        <div className="grid gap-2">
          {a.options?.map((o) => (
            <button key={o.value} onClick={() => setChoice(o.value)}
              className={`rounded-xl p-4 text-left transition ${choice === o.value ? 'bg-or-400 text-nuit-950' : 'bg-white/5 hover:bg-white/10'}`}>
              {o.label}
            </button>
          ))}
        </div>
      )}
      {a.kind === 'bavard' && (
        <div className="space-y-4">
          <div className="grid gap-2">
            {a.options?.map((o) => (
              <button key={o.value} onClick={() => { setChoice(o.value); setDest([]); }}
                className={`rounded-xl p-4 text-left transition ${choice === o.value ? 'bg-or-400 text-nuit-950' : 'bg-white/5 hover:bg-white/10'}`}>
                {o.label}
              </button>
            ))}
          </div>
          {(choice === 'annuler' || choice === 'rediriger') && (
            <>
              <p className="text-center text-sm text-parchemin-300">{choice === 'annuler' ? 'Le vote de qui sera annulé ?' : 'Le vote de qui sera détourné ?'}</p>
              <Picker items={a.candidates} value={targets} onChange={(v) => { setTargets(v); setDest([]); }} max={1} />
            </>
          )}
          {choice === 'rediriger' && targets[0] && (
            <>
              <p className="text-center text-sm text-parchemin-300">Vers qui son vote ira-t-il ?</p>
              <Picker items={a.candidates.filter((c) => c.id !== targets[0])} value={dest} onChange={setDest} max={1} />
            </>
          )}
        </div>
      )}
      {a.kind === 'witch' && (
        <div className="space-y-4">
          <div className="panel p-4">
            <p className="label flex items-center gap-1.5"><Icon name="shieldPlus" className="h-4 w-4 text-foret-400" />Soigner</p>
            {a.victims?.length ? (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setHeal('')} className={`chip ${!heal ? 'bg-or-400 text-nuit-950' : ''}`}>Personne</button>
                {a.victims.map((v) => <button key={v.id} onClick={() => setHeal(v.id)} className={`chip ${heal === v.id ? 'bg-or-400 text-nuit-950' : ''}`}>{v.name}</button>)}
              </div>
            ) : <p className="text-sm text-parchemin-300/70">Aucune victime à soigner.</p>}
          </div>
          <div className="panel p-4">
            <p className="label flex items-center gap-1.5"><Icon name="skull" className="h-4 w-4 text-red-300" />Empoisonner</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setPoison('')} className={`chip ${!poison ? 'bg-or-400 text-nuit-950' : ''}`}>Personne</button>
              {a.candidates.map((c) => <button key={c.id} onClick={() => setPoison(c.id)} className={`chip ${poison === c.id ? 'bg-sang-500 text-parchemin-50' : ''}`}>{c.name}</button>)}
            </div>
          </div>
        </div>
      )}

      <button className="btn-gold w-full py-3" onClick={submit} disabled={busy}>{busy ? 'Envoi…' : 'Valider'}</button>
    </div>
  );
}

function Picker({ items, value, onChange, max }: { items: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; max: number }) {
  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else if (max === 1) onChange([id]);
    else if (value.length < max) onChange([...value, id]);
  };
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((c) => (
        <button key={c.id} onClick={() => toggle(c.id)}
          className={`rounded-xl p-3 transition ${value.includes(c.id) ? 'bg-or-400 text-nuit-950' : 'bg-white/5 hover:bg-white/10'}`}>
          {c.name}
        </button>
      ))}
    </div>
  );
}

/** Joueur appelé la nuit : il peut retourner sa carte (repliée par défaut pour laisser place à l'action). */
function AwakeCard({ view }: { view: PlayerView }) {
  const [open, setOpen] = useState(false);
  const [revealed, setRevealed] = useState(true);
  if (!view.me.roleId) return null;
  return (
    <div className="text-center">
      <button className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}><Icon name="eye" className="h-3.5 w-3.5" />{open ? 'Masquer ma carte' : 'Voir ma carte'}</button>
      {open && <div className="mt-3"><RoleCard roleId={view.me.roleId} revealed={revealed} onToggle={() => setRevealed((r) => !r)} lover={view.me.lover} /></div>}
    </div>
  );
}

function WolfChatPanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const chat = view.wolfChat!;
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [chat.messages.length]);
  return (
    <div className="space-y-3 animate-rise">
      <AwakeCard view={view} />
      <div className="panel p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-parchemin-300/70">La meute</p>
        <p className="mt-1 text-sm text-parchemin-200">{chat.pack.join(' · ')}</p>
      </div>
      <div className="panel flex h-[60vh] flex-col overflow-hidden">
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {chat.messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromId === view.me.id ? 'justify-end' : ''}`}>
              <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${m.fromId === view.me.id ? 'bg-sang-600/80' : 'bg-white/10'}`}>
                <div className="text-[10px] text-parchemin-300/70">{m.fromName} · {fmtTime(m.at)}</div>
                <div>{m.text}</div>
              </div>
            </div>
          ))}
          {!chat.messages.length && <p className="pt-10 text-center text-sm italic text-parchemin-300/60">Silence…</p>}
          <div ref={endRef} />
        </div>
        <form className="flex gap-2 border-t border-white/5 p-2" onSubmit={async (e) => { e.preventDefault(); if (text.trim() && (await send('player:wolfChat', { text }))) setText(''); }}>
          <input className="input flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="Murmurer…" />
          <button className="btn-danger" disabled={!text.trim()} aria-label="Envoyer"><Icon name="send" /></button>
        </form>
      </div>
    </div>
  );
}

function VotePanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  return <><VoteBackdrop /><VoteInner view={view} send={send} /></>;
}

function VoteInner({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const v = view.vote!;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—';
  if (v.status === 'closed' && v.published) return <PublishedVerdict view={view} />;
  return v.canVote ? <BallotPicker vote={v} onVote={(id) => send('player:ballot', { targetId: id })} meId={view.me.id} /> : (
    <div className="frame stage-in p-6 text-center">
      <Icon name="vote" className="mx-auto h-10 w-10 text-or-300" />
      <p className="mt-2 text-parchemin-200">Le village vote.</p>
      <p className="mt-1 text-sm text-parchemin-300/70">Vous ne participez pas à ce vote.</p>
    </div>
  );
}

/** Meute réveillée : 1 minute, chaque loup touche une proie ; tous voient les suggestions. */
function PackPanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const a = view.action!;
  const left = useCountdown(a.endsAt);
  const nameOf = (id: string) => a.candidates.find((c) => c.id === id)?.name ?? view.players.find((p) => p.id === id)?.name ?? '—';
  if (a.chosen || a.recorded) return (
    <div className="panel p-6 text-center animate-rise">
      <Icon name="check" className="pop-in mx-auto h-10 w-10 text-foret-400" strokeWidth={2.5} />
      <p className="mt-2 text-lg text-or-200">La meute a choisi : {a.chosen ? nameOf(a.chosen) : '—'}</p>
      <p className="mt-2 text-parchemin-200">Fermez les yeux et attendez le réveil suivant.</p>
    </div>
  );
  const byTarget = new Map((a.suggestions ?? []).map((s) => [s.targetId, s.by]));
  return (
    <div className="space-y-4 animate-rise">
      <div className="panel p-5 text-center">
        <p className="text-xs uppercase tracking-widest text-parchemin-300/70">La meute choisit sa proie</p>
        <p className={`mt-1 font-display text-4xl tabular-nums ${left !== null && left <= 10 ? 'text-red-300' : 'text-gold'}`}>
          {left === null ? '—' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}
        </p>
        <p className="mt-2 text-sm text-parchemin-200">Touchez une personne pour la suggérer. À la fin du temps, la plus suggérée est retenue.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {a.candidates.map((c) => {
          const by = byTarget.get(c.id) ?? [];
          const mine = a.mine === c.id;
          return (
            <button key={c.id} disabled={left === 0} onClick={() => send('player:wolfSuggest', { targetId: mine ? null : c.id })}
              className={`relative rounded-xl p-3 text-left transition ${mine ? 'bg-sang-600/80 ring-2 ring-red-300' : by.length ? 'bg-sang-700/30 ring-1 ring-sang-500/60' : 'bg-white/5 hover:bg-white/10'}`}>
              <span className="block truncate font-medium">{c.name}</span>
              {by.length > 0 && (
                <>
                  <span className="absolute right-2 top-2 rounded-full bg-red-300 px-1.5 text-xs font-bold text-nuit-950">{by.length}</span>
                  <span className="mt-1 block truncate text-[11px] text-parchemin-200/80">🐺 {by.join(', ')}</span>
                </>
              )}
            </button>
          );
        })}
      </div>
      {view.wolfChat?.open && <WolfChatPanel view={view} send={send} />}
    </div>
  );
}

/** Chasseur abattu : il choisit lui-même qui il emporte ; validé dès qu'il touche. */
function HunterPanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const h = view.hunter!;
  const [pick, setPick] = useState<string | null>(null);
  return (
    <div className="space-y-4 animate-rise">
      <div className="panel p-5 text-center">
        <Icon name="target" className="mx-auto h-10 w-10 text-red-300" />
        <h2 className="mt-2 text-2xl text-gold">Chasseur, vous êtes tombé</h2>
        <p className="mt-2 text-sm text-parchemin-200">Dans un dernier souffle, désignez la personne que vous emportez dans la tombe.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {h.candidates.map((c) => (
          <button key={c.id} disabled={!!pick} onClick={async () => { setPick(c.id); if (!(await send('player:hunterShot', { targetId: c.id }))) setPick(null); }}
            className={`rounded-xl p-3 transition ${pick === c.id ? 'bg-sang-600 text-parchemin-50' : 'bg-white/5 hover:bg-white/10'}`}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Ancien Chef : il transmet lui-même son titre ; validé dès qu'il touche. */
function SuccessionPanel({ view, send }: { view: PlayerView; send: (e: string, p: unknown) => Promise<boolean> }) {
  const s = view.succession!;
  const [pick, setPick] = useState<string | null>(null);
  return (
    <div className="space-y-4 animate-rise">
      <div className="panel p-5 text-center">
        <Icon name="crown" className="mx-auto h-10 w-10 text-or-300" />
        <h2 className="mt-2 text-2xl text-gold">Chef, vous quittez le village</h2>
        <p className="mt-2 text-sm text-parchemin-200">Avant de partir, désignez celui ou celle qui vous succède comme Chef du village.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {s.candidates.map((c) => (
          <button key={c.id} disabled={!!pick} onClick={async () => { setPick(c.id); if (!(await send('player:chiefSuccessor', { targetId: c.id }))) setPick(null); }}
            className={`rounded-xl p-3 transition ${pick === c.id ? 'bg-or-400 text-nuit-950' : 'bg-white/5 hover:bg-white/10'}`}>
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function useCountdown(closesAt?: number) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!closesAt) { setLeft(null); return; }
    const tick = () => setLeft(Math.max(0, Math.round((closesAt - Date.now()) / 1000)));
    tick(); const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [closesAt]);
  return left;
}

/** Joueur maudit par le Corbeau dans ce vote (ses +2 voix), s'il y en a un. */
export function cursedOf(r: { entries: { playerId: string; details: { from: string }[] }[] }) {
  return r.entries.find((e) => e.details.some((d) => d.from === 'corbeau'))?.playerId ?? null;
}

/**
 * Révélation par étapes : suspense → (malédiction du Corbeau, annoncée d'abord) → désigné(e) → détail des voix.
 * Renvoie 0 (suspense), puis 1 (désigné) et 2 (détail) ; `curse` indique si la malédiction est affichée.
 */
export function useVerdictStage(key: string, cursed = false) {
  const [stage, setStage] = useState(0);
  const [curse, setCurse] = useState(false);
  useEffect(() => {
    setStage(0); setCurse(false);
    const delay = cursed ? 5000 : 0;
    const t = [
      cursed ? setTimeout(() => setCurse(true), 4500) : undefined,
      setTimeout(() => setStage(1), 5000 + delay),
      setTimeout(() => setStage(2), 9500 + delay),
    ];
    return () => t.forEach((x) => x && clearTimeout(x));
  }, [key, cursed]);
  return { stage, curse };
}

function PublishedVerdict({ view }: { view: PlayerView }) {
  const v = view.vote!;
  const r = v.published!;
  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '—';
  const max = r.entries[0]?.total ?? 1;
  const cursed = cursedOf(r);
  const { stage, curse } = useVerdictStage(v.id, !!cursed);
  return (
      <div className="space-y-3">
        <div className="frame stage-in p-5 text-center">
          <p className="frame-title justify-center after:hidden"><Icon name="scale" className="h-4 w-4" />{v.label}</p>
          <h2 className="mt-1 font-display text-2xl text-gold">Le village a parlé</h2>
          {curse && cursed && <p className="pop-in mt-3 flex items-center justify-center gap-1.5 text-or-200"><Icon name="feather" className="h-4 w-4" />Le Corbeau a maudit {nameOf(cursed)} : +2 voix</p>}
          {stage === 0 && !curse && <p className="mt-3 flex items-center justify-center gap-1.5 text-parchemin-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />Le village tranche…</p>}
          {stage >= 1 && r.leaders.length === 1 && <p className={`pop-in mt-2 text-lg ${v.kind === 'elimination' ? 'text-red-200' : 'text-or-100'}`}>{nameOf(r.leaders[0])}</p>}
          {stage >= 1 && r.leaders.length > 1 && <p className="pop-in mt-2 text-or-200">Égalité : le Maître du jeu tranche.</p>}
        </div>
        {stage >= 2 && <ul className="frame stage-in space-y-2.5 p-4">
          {r.entries.map((e, i) => {
            const lead = r.leaders.includes(e.playerId);
            return (
              <li key={e.playerId} className="flex items-center gap-3">
                <span className={`w-24 shrink-0 truncate text-sm sm:w-32 ${lead ? 'font-semibold text-or-100' : ''}`}>{nameOf(e.playerId)}{e.playerId === view.me.id && ' (vous)'}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
                  <span className={`bar-grow block h-full rounded-full ${lead ? 'bg-gradient-to-r from-sang-600 to-sang-500' : 'bg-or-400/70'}`} style={{ width: `${(e.total / max) * 100}%`, animationDelay: `${0.2 + i * 0.1}s` }} />
                </span>
                <span className="w-6 text-right font-title text-sm text-or-100">{e.total}</span>
              </li>
            );
          })}
          {!r.entries.length && <li className="text-center text-sm italic text-parchemin-300/70">Aucune voix exprimée.</li>}
        </ul>}
      </div>
    );
}

function BallotPicker({ vote, onVote, meId }: { vote: NonNullable<PlayerView['vote']>; onVote: (id: string) => Promise<boolean>; meId: string }) {
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useCountdown(vote.closesAt);
  const total = vote.closesAt ? Math.max(1, Math.round((vote.closesAt - Date.now()) / 1000) + 1) : 0;
  const [startLeft] = useState(() => (vote.closesAt ? Math.max(1, Math.round((vote.closesAt - Date.now()) / 1000)) : 0));
  void total;
  const timer = left !== null && (
    <div className="mt-3">
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full transition-all duration-500 ${left < 10 ? 'bg-sang-500' : 'bg-or-400'}`} style={{ width: `${(left / Math.max(startLeft, 1)) * 100}%` }} />
      </div>
      <p className={`mt-1 flex items-center justify-center gap-1 text-xs ${left < 10 ? 'animate-pulse text-red-300' : 'text-parchemin-300/80'}`}><Icon name="clock" className="h-3.5 w-3.5" />{left > 0 ? `${left}s` : 'Clôture…'}</p>
    </div>
  );

  // Élection du Chef (ou vote libre) : on vote « pour » ; élimination : on vote « contre ».
  const against = vote.kind === 'elimination';
  if (vote.myBallot) return (
    <div className="frame stage-in p-6 text-center">
      <span className="pop-in mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-or-400 text-nuit-950 shadow-glow"><Icon name="check" className="h-8 w-8" strokeWidth={3} /></span>
      <p className="mt-3 font-display text-xl text-gold">Bulletin scellé</p>
      <p className="mt-1 text-parchemin-200">{against ? 'Contre' : 'Pour'} <strong className="text-or-100">{vote.candidates.find((c) => c.id === vote.myBallot)?.name}</strong></p>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-sm text-parchemin-300/70"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />Les autres votent… les résultats arrivent dès que tout le monde a voté.</p>
      {timer}
    </div>
  );

  const confirm = async () => {
    if (!pick || busy) return;
    setBusy(true);
    await onVote(pick);
    setBusy(false);
  };
  const candidates = vote.candidates.filter((c) => c.id !== meId);
  return (
    <div className="space-y-4 pb-24">
      <div className="frame stage-in p-5 text-center">
        <p className="frame-title justify-center after:hidden"><Icon name="vote" className="h-4 w-4" />{vote.label}</p>
        <h2 className="mt-1 font-display text-2xl text-gold">{vote.kind === 'chef' ? 'Qui voulez-vous comme Chef du village ?' : 'Qui accusez-vous ?'}</h2>
        <p className="mt-1 text-sm text-parchemin-300/80">Votre vote reste secret jusqu’à la clôture.</p>
        {timer}
      </div>
      <div className="stagger grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {candidates.map((c) => (
          <button key={c.id} onClick={() => setPick(c.id)} className={`ballot flex items-center gap-2.5 text-left ${pick === c.id ? 'ballot-on' : ''}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-title text-sm ${pick === c.id ? 'bg-nuit-950 text-or-300' : 'bg-or-400/20 text-or-200'}`}>
              {pick === c.id ? <Icon name="target" className="h-5 w-5" /> : c.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 truncate font-medium">{c.name}</span>
          </button>
        ))}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-nuit-950 via-nuit-950/90 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-6">
        <button className="btn-danger mx-auto flex w-full max-w-xl py-3.5 text-base" disabled={!pick || busy} onClick={confirm}>
          <Icon name="vote" className="h-5 w-5" />
          {busy ? 'Envoi…' : pick ? `${against ? 'Voter contre' : 'Voter pour'} ${vote.candidates.find((c) => c.id === pick)?.name}` : 'Touchez un nom'}
        </button>
      </div>
    </div>
  );
}

/** Le village vu par un joueur : la grande table illustrée, places dans le sens horaire. */
function Village({ view }: { view: PlayerView }) {
  const players = [...view.players].sort((a, b) => a.seat - b.seat);
  const n = players.length;
  const token = seatSize(n);
  const loverId = view.me.lover?.id;
  return (
    <section className="panel p-3">
      <p className="label">Le village</p>
      <TableScene night={view.game.phase === 'night'} center={<span className="text-[10px] text-parchemin-200 sm:text-xs">{players.filter((p) => p.alive).length} en vie</span>}>
        {players.map((p, i) => {
          const pos = seatPosition(i, n);
          const inLove = !!loverId && (p.id === loverId || p.id === view.me.id);
          const ring = inLove ? 'ring-[3px] ring-pink-400 shadow-[0_0_14px_rgba(236,72,153,.7)]' : p.isChief ? 'ring-[3px] ring-or-300 shadow-glow' : p.alive ? 'ring-2 ring-or-400/60' : 'ring-2 ring-sang-500/60';
          return (
            <div key={p.id} className="seat-in absolute block -translate-x-1/2 -translate-y-1/2" style={{ left: `${pos.left}%`, top: `${pos.top}%`, width: `${token}%`, animationDelay: `${i * 40}ms` }}>
              {p.isChief && <Icon name="crown" className="absolute -top-[55%] left-1/4 z-10 h-1/2 w-1/2 text-or-300 drop-shadow-[0_0_6px_rgba(234,179,8,.8)]" />}
              <span className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-full bg-nuit-900 font-display text-or-100 shadow-[0_4px_10px_rgba(0,0,0,.7)] ${ring} ${p.id === view.me.id ? 'outline outline-2 outline-offset-2 outline-or-200/80' : ''}`}>
                {p.revealedRoleId ? <RoleArt roleId={p.revealedRoleId} label={false} className={`h-full w-full ${p.alive ? '' : 'grayscale brightness-50'}`} /> : <span className="text-[clamp(8px,2.2vw,15px)]">{p.name.slice(0, 1).toUpperCase()}</span>}
                {!p.alive && <span className="absolute inset-0 flex items-center justify-center text-red-200/90"><Icon name="skull" className="h-1/2 w-1/2" /></span>}
              </span>
              <span className={`absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-nuit-950 ${p.connected ? 'bg-foret-400' : 'bg-parchemin-300/40'}`} />
              <span className={`absolute left-1/2 top-[102%] max-w-[240%] -translate-x-1/2 whitespace-nowrap truncate rounded bg-nuit-950/85 px-1 text-[8px] leading-tight sm:text-[11px] ${p.alive ? 'text-parchemin-50' : 'text-parchemin-300 line-through'} ${p.id === view.me.id ? 'font-semibold text-or-100' : ''}`}>{p.id === view.me.id ? 'Vous' : p.name}</span>
            </div>
          );
        })}
      </TableScene>
    </section>
  );
}

function Whispers({ view }: { view: PlayerView }) {
  return (
    <section className="panel p-4 text-left">
      <p className="label flex items-center gap-1.5"><Icon name="mail" className="h-4 w-4" />Murmures</p>
      <ul className="space-y-2 text-sm">
        {[...view.me.whispers].reverse().map((m) => <li key={m.id} className="rounded-lg bg-white/5 px-3 py-2">{m.text}</li>)}
      </ul>
    </section>
  );
}

function Charmed({ view }: { view: PlayerView }) {
  if (!view.me.charmed) return null;
  return (
    <section className="panel p-3 text-center">
      <p className="flex items-center justify-center gap-1.5 text-sm text-teal-300"><Icon name="music" className="h-4 w-4" />Vous êtes enchanté(e)</p>
      {view.me.charmedPeers.length > 0 && <p className="text-xs text-parchemin-300/70">Autres : {view.me.charmedPeers.join(', ')}</p>}
    </section>
  );
}

function Lobby({ view }: { view: PlayerView }) {
  return (
    <div className="panel p-6 text-center">
      <img src="/assets/dos-carte.webp" alt="" className="mx-auto w-40 rounded-xl" />
      <h2 className="mt-4 text-2xl text-gold">Bienvenue, {view.me.name}</h2>
      <p className="mt-1 text-parchemin-300/70 text-sm">Partie <span className="font-mono tracking-widest text-parchemin-100">{view.game.code}</span></p>
      <p className="mt-1 text-parchemin-200">Le Maître du jeu prépare la partie.</p>
      <ul className="mt-4 flex flex-wrap justify-center gap-2">
        {view.players.map((p) => (
          <li key={p.id} className={`chip ${p.id === view.me.id ? 'bg-or-400 text-nuit-950' : ''}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${p.connected ? 'bg-foret-400' : 'bg-parchemin-300/30'}`} />{p.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ending({ view, onLeave }: { view: PlayerView; onLeave: () => void }) {
  const [sheet, setSheet] = useState(false);
  return (
    <div className="space-y-4 text-center animate-rise">
      <div className="panel p-6">
        <p className="text-xs uppercase tracking-widest text-parchemin-300/70">Fin de la partie</p>
        <h2 className="mt-1 text-3xl text-gold">{view.game.winner}</h2>
        <p className={`mt-2 ${view.me.isWinner ? 'text-or-200' : 'text-parchemin-300'}`}>
          {view.me.isWinner ? 'Vous avez gagné !' : 'Vous n’avez pas gagné'}
        </p>
      </div>
      {view.me.roleId && <RoleCard roleId={view.me.roleId} revealed lover={view.me.lover} />}
      {view.me.roleId && <button className="btn-ghost" onClick={() => setSheet(true)}>Voir ma fiche</button>}
      {view.me.roleId && <Modal open={sheet} onClose={() => setSheet(false)} title="Ma fiche" wide><RoleSheetView roleId={view.me.roleId} /></Modal>}
      <Village view={view} />
      <p className="panel flex items-center justify-center gap-2 p-3 text-sm text-parchemin-200"><Icon name="info" className="h-4 w-4 text-or-300" />Restez sur cette page : si le Maître du jeu lance une revanche, vous serez replacé(e) automatiquement à la table.</p>
      <Link to="/" className="btn-ghost" onClick={onLeave}>Quitter la table</Link>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center px-4"><Background mode="night" /><div className="panel max-w-md p-6 text-center">{children}</div></div>;
}

function phaseLabel(v: PlayerView) {
  const g = v.game;
  if (g.status === 'lobby') return 'en préparation';
  if (g.status === 'ended') return 'terminée';
  if (g.status === 'cancelled') return 'annulée';
  return g.phase === 'night' ? `Nuit ${g.nightNumber}` : `Jour ${g.dayNumber}`;
}
