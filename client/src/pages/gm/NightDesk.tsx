import { useEffect, useMemo, useRef, useState } from 'react';
import { NIGHT_ACTIONS, PACK_ROLES } from '@shared/roles';
import type { NightActionKey, NightActionRecord, PlayerState } from '@shared/types';
import { Icon } from '../../components/Icon';
import { RoleArt } from '../../components/RoleArt';
import { fmtTime } from '../../lib/api';
import type { GmApi, GmView } from '../../lib/useGm';

type Step = NightActionKey | 'bilan';

/**
 * La nuit, jouée comme une scène : le village s'endort, le MJ appelle les rôles un par un,
 * chaque téléphone répond, puis le MJ valide le bilan et fait lever le jour.
 */
export function NightDesk({ gm, game }: { gm: GmApi; game: GmView }) {
  const night = game.night!;
  const actions = game.availableActions.filter((a) => !a.reason);
  const [started, setStarted] = useState(() => Object.keys(night.actions).length > 0 || night.awake != null);
  const [step, setStep] = useState<Step>(() => actions.find((a) => !night.actions[a.key])?.key ?? 'bilan');

  useEffect(() => {
    if (step !== 'bilan' && !actions.some((a) => a.key === step)) setStep(actions[0]?.key ?? 'bilan');
  }, [actions, step]);
  // Le rôle affiché est celui réveillé côté serveur (son téléphone s'allume).
  const wantAwake = !started || step === 'bilan' ? null : step;
  useEffect(() => {
    if (night.validated || night.awake === wantAwake) return;
    if (wantAwake && !actions.some((a) => a.key === wantAwake)) return;
    gm.act('wake', { key: wantAwake });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantAwake, night.awake, night.validated]);

  if (night.validated) return <Dawn gm={gm} game={game} />;
  if (!started) return <Nightfall game={game} actions={actions.map((a) => a.key)} onStart={() => setStarted(true)} />;

  const next = () => {
    const i = actions.findIndex((a) => a.key === step);
    const n = actions.slice(i + 1).find((a) => !night.actions[a.key]) ?? actions[i + 1];
    setStep(n ? n.key : 'bilan');
  };

  return (
    <div className="space-y-4">
      {/* Frise des appels */}
      <div className={`frame px-3 py-3 ${actions.length ? '' : 'hidden'}`}>
        <ol className="flex items-center gap-1 overflow-x-auto pb-1">
          {actions.map((a, i) => {
            const info = NIGHT_ACTIONS.find((x) => x.key === a.key)!;
            const done = !!night.actions[a.key];
            const on = step === a.key;
            return (
              <li key={a.key} className="flex shrink-0 items-center">
                {i > 0 && <span className={`mx-1 h-px w-4 sm:w-6 ${done ? 'bg-foret-400' : 'bg-or-500/30'}`} />}
                <button onClick={() => setStep(a.key)} title={info.title} className="group flex flex-col items-center gap-1">
                  <span className={`relative h-11 w-11 overflow-hidden rounded-full ring-2 transition ${on ? 'scale-110 ring-or-300 shadow-glow' : done ? 'ring-foret-400' : 'ring-or-500/30 opacity-70 group-hover:opacity-100'}`}>
                    <RoleArt roleId={info.role === 'pack' ? 'loup' : info.role} label={false} className="h-full w-full scale-150 object-top" />
                    {done && <span className="pop-in absolute inset-0 flex items-center justify-center bg-foret-700/70 text-white"><Icon name="check" className="h-5 w-5" strokeWidth={3} /></span>}
                  </span>
                  <span className={`max-w-[64px] truncate text-[10px] ${on ? 'text-or-100' : 'text-parchemin-300/60'}`}>{info.title.replace(/^Les? |^La |^L’/, '')}</span>
                </button>
              </li>
            );
          })}
          <li className="flex shrink-0 items-center">
            <span className="mx-1 h-px w-4 bg-or-500/30 sm:w-6" />
            <button onClick={() => setStep('bilan')} className="flex flex-col items-center gap-1">
              <span className={`flex h-11 w-11 items-center justify-center rounded-full ring-2 transition ${step === 'bilan' ? 'scale-110 bg-or-400 text-nuit-950 ring-or-200 shadow-glow' : 'bg-white/5 text-or-200 ring-or-500/30'}`}>
                <Icon name="scroll" className="h-5 w-5" />
              </span>
              <span className={`text-[10px] ${step === 'bilan' ? 'text-or-100' : 'text-parchemin-300/60'}`}>Bilan</span>
            </button>
          </li>
        </ol>
      </div>

      <div key={step} className="stage-in">
        {step === 'bilan' ? <Recap gm={gm} game={game} /> : <RoleCall gm={gm} game={game} actionKey={step} onNext={next} />}
      </div>

      <WolfChat game={game} />
    </div>
  );
}

/** Ouverture de la nuit : le village s'endort, le MJ lance l'appel des rôles. */
function Nightfall({ game, actions, onStart }: { game: GmView; actions: NightActionKey[]; onStart: () => void }) {
  const n = game.night!.number;
  return (
    <div className="frame overflow-hidden px-5 py-8 text-center sm:py-12">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,77,204,.25),transparent)]" />
      <div className="relative">
        <Icon name="moon" className="moon-glow mx-auto h-16 w-16 text-mystic-400" strokeWidth={1.5} />
        <p className="frame-title mt-5 justify-center !text-mystic-400 after:hidden">Nuit {n}</p>
        <h2 className="mt-2 font-display text-3xl text-gold sm:text-4xl">Le village s’endort</h2>
        <p className="mx-auto mt-3 max-w-md text-parchemin-200/80">
          {n === 1 ? 'Nuit de préparation : aucune attaque. ' : ''}« Fermez les yeux… » Quand tout le monde dort, appelez les rôles un à un.
        </p>
        {actions.length > 0 && (
          <div className="stagger mt-6 flex flex-wrap justify-center gap-3">
            {actions.map((k) => {
              const info = NIGHT_ACTIONS.find((x) => x.key === k)!;
              return (
                <div key={k} className="flex w-16 flex-col items-center gap-1">
                  <span className="h-20 w-14 overflow-hidden rounded-md ring-1 ring-or-400/50"><RoleArt roleId={info.role === 'pack' ? 'loup' : info.role} label={false} className="h-full w-full" /></span>
                  <span className="w-full truncate text-[10px] text-parchemin-300/70">{info.title.replace(/^Les? |^La |^L’/, '')}</span>
                </div>
              );
            })}
          </div>
        )}
        <button className="btn-gold mt-8 px-8 py-3 text-base shadow-glow" onClick={onStart}>
          <Icon name="bell" className="h-5 w-5" />
          {actions.length ? 'Appeler les rôles' : 'Aller au bilan'}
        </button>
      </div>
    </div>
  );
}

function holdersOf(game: GmView, key: NightActionKey): PlayerState[] {
  const info = NIGHT_ACTIONS.find((a) => a.key === key)!;
  if (info.role === 'pack')
    return game.players.filter((p) => p.alive && p.roleId && (PACK_ROLES.includes(p.roleId) || (p.roleId === 'chienLoup' && game.powers.chienLoupCamp === 'loups')));
  return game.players.filter((p) => p.roleId === info.role && p.alive);
}

/** Appel d'un rôle : carte au centre, attente animée, puis le choix reçu du téléphone. */
function RoleCall({ gm, game, actionKey, onNext }: { gm: GmApi; game: GmView; actionKey: NightActionKey; onNext: () => void }) {
  const info = NIGHT_ACTIONS.find((a) => a.key === actionKey)!;
  const rec = game.night!.actions[actionKey];
  const holders = holdersOf(game, actionKey);
  const roleId = info.role === 'pack' ? 'loup' : info.role;

  return (
    <div className={`frame p-5 sm:p-6 ${rec ? '' : 'frame-live'}`}>
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
        <div className={`relative shrink-0 ${rec ? '' : 'ring-wait rounded-full'}`}>
          <span className="block h-44 w-32 overflow-hidden rounded-xl ring-2 ring-or-400/70 shadow-glow">
            <RoleArt roleId={roleId} className="h-full w-full" />
          </span>
          {rec && (
            <span className="pop-in absolute -bottom-3 -right-3 flex h-11 w-11 items-center justify-center rounded-full bg-foret-500 text-white ring-4 ring-nuit-950">
              <Icon name="check" className="h-6 w-6" strokeWidth={3} />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 text-center sm:text-left">
          <p className="frame-title justify-center sm:justify-start">Appel du rôle</p>
          <h3 className="mt-1 font-display text-2xl text-gold">{info.title}</h3>
          <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-parchemin-300">
            <Icon name="users" className="h-3.5 w-3.5" />{holders.map((h) => h.name).join(', ') || '—'}
          </p>
          {rec ? (
            <div className="stage-in mt-4 rounded-lg bg-foret-700/25 p-3 ring-1 ring-foret-400/40">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foret-400"><Icon name="check" className="h-4 w-4" />Action effectuée</p>
              <p className="mt-1 text-parchemin-50">{summarize(game, rec)}</p>
            </div>
          ) : (
            <div className="mt-4 rounded-lg bg-white/5 p-3 ring-1 ring-or-500/20">
              <p className="flex items-center gap-1.5 text-sm text-or-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />En attente du téléphone…</p>
              <p className="mt-1 text-sm italic text-parchemin-300/80">« {info.title}, réveillez-vous. » — {info.hint}</p>
            </div>
          )}
          <div className="mt-5 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button className={rec ? 'btn-gold px-6' : 'btn-ghost'} onClick={onNext}>
              {rec ? 'Rôle suivant' : 'Passer'}<Icon name={rec ? 'arrowRight' : 'skip'} />
            </button>
            {rec && (
              <button className="btn-ghost btn-sm" title="Le joueur devra choisir à nouveau" onClick={() => gm.act('clearAction', { key: actionKey })}>
                <Icon name="eraser" className="h-3.5 w-3.5" />Effacer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function summarize(game: GmView, r: NightActionRecord) {
  const n = (id?: string | null) => game.players.find((p) => p.id === id)?.name ?? '—';
  switch (r.key) {
    case 'chienLoup': return r.choice === 'loups' ? 'Rejoint les Loups-Garous' : 'Reste avec les Villageois';
    case 'angeDechu': return r.choice === 'survie' ? 'Choisit de survivre' : 'Choisit d’être éliminé au premier vote';
    case 'loupNoir': return r.choice === 'transformer' ? 'Transforme la victime' : 'Ne transforme pas';
    case 'loupBavard': return r.choice === 'annuler' ? `Annule le vote de ${n(r.targets[0])}` : r.choice === 'rediriger' ? `Redirige le vote de ${n(r.targets[0])} vers ${n(r.targets[1])}` : 'Garde son pouvoir';
    case 'sorciere': return [r.heal ? `Soigne ${n(r.heal)}` : '', r.poison ? `Empoisonne ${n(r.poison)}` : ''].filter(Boolean).join(' · ') || 'Aucune potion';
    default: return r.targets.map(n).join(', ');
  }
}

const KIND_ICON = { death: 'skull', transform: 'moon', ancienShield: 'shieldPlus', whisper: 'mail', info: 'info', renardLost: 'paw' } as const;

/** Bilan de la nuit : le MJ coche ce qui s'applique, puis valide. */
function Recap({ gm, game }: { gm: GmApi; game: GmView }) {
  const proposals = game.proposedConsequences;
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState<{ playerId: string; reason: string }[]>([]);
  const [extraId, setExtraId] = useState('');
  const [extraReason, setExtraReason] = useState('');
  const [more, setMore] = useState(false);
  const recorded = Object.values(game.night!.actions);
  const ids = useMemo(() => new Set(proposals.map((p) => p.id)), [proposals]);
  const isOn = (id: string, def: boolean) => (toggled.has(id) ? !def : def);
  const toggle = (id: string) => setToggled((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const checked = proposals.filter((c) => !c.informative && isOn(c.id, c.checked) && ids.has(c.id)).map((c) => c.id);
  const name = (id: string) => game.players.find((p) => p.id === id)?.name ?? '—';
  const deaths = proposals.filter((c) => c.kind === 'death' && isOn(c.id, c.checked)).length + extra.length;
  // Toutes les actions de la nuit sont faites : le bilan se valide tout seul (morts annoncées, messages envoyés aux joueurs concernés).
  const allDone = game.availableActions.filter((a) => !a.reason).every((a) => game.night!.actions[a.key]);
  const auto = useRef(false);
  useEffect(() => {
    if (!allDone || auto.current) return;
    auto.current = true;
    const t = setTimeout(() => gm.act('validateNight', { checked: proposals.filter((c) => !c.informative && c.checked).map((c) => c.id), extraDeaths: [] }), 1500);
    return () => { clearTimeout(t); auto.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone]);

  return (
    <div className="frame space-y-4 p-5 sm:p-6">
      <p className="frame-title">Bilan de la nuit {game.night!.number}</p>
      {allDone && <p className="flex items-center gap-2 text-sm text-or-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />Bilan validé automatiquement…</p>}
      {recorded.length > 0 ? (
        <ul className="stagger grid gap-2 sm:grid-cols-2">
          {recorded.map((r) => {
            const info = NIGHT_ACTIONS.find((a) => a.key === r.key)!;
            return (
              <li key={r.key} className="tile flex items-center gap-2.5 p-2">
                <span className="h-10 w-7 shrink-0 overflow-hidden rounded"><RoleArt roleId={info.role === 'pack' ? 'loup' : info.role} label={false} className="h-full w-full" /></span>
                <span className="min-w-0 text-sm leading-tight"><span className="block text-or-100">{info.title}</span><span className="text-parchemin-300/80">{summarize(game, r)}</span></span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm italic text-parchemin-300/70">Aucune décision enregistrée.</p>
      )}

      <ul className="stagger space-y-2">
        {proposals.map((c) =>
          c.informative ? (
            <li key={c.id} className="flex items-center gap-2 px-1 text-sm text-parchemin-300/80"><Icon name="info" className="h-4 w-4" />{c.label}</li>
          ) : (
            <li key={c.id}>
              <button onClick={() => toggle(c.id)} className={`flex w-full items-start gap-3 rounded-lg p-3 text-left ring-1 transition ${isOn(c.id, c.checked) ? (c.kind === 'death' ? 'bg-sang-700/30 ring-sang-500/70' : 'bg-or-400/10 ring-or-400/60') : 'bg-white/[.03] opacity-60 ring-white/10'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ring-1 ${isOn(c.id, c.checked) ? 'bg-or-400 text-nuit-950 ring-or-200' : 'ring-or-500/40'}`}>
                  {isOn(c.id, c.checked) && <Icon name="check" className="h-4 w-4" strokeWidth={3} />}
                </span>
                <Icon name={KIND_ICON[c.kind]} className={`mt-0.5 h-4 w-4 ${c.kind === 'death' ? 'text-red-300' : 'text-or-200'}`} />
                <span className="min-w-0 flex-1">
                  {c.label}
                  {c.whisper && <span className="block text-xs italic text-parchemin-300/70">« {c.whisper} »</span>}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>

      <button className="inline-flex items-center gap-1.5 text-sm text-or-200" onClick={() => setMore((m) => !m)}>
        <Icon name="plus" className={`h-4 w-4 transition ${more ? 'rotate-45' : ''}`} />{more ? 'Masquer les options' : 'Ajouter une élimination, options…'}
      </button>
      {more && (
        <div className="stage-in space-y-2 rounded-lg bg-white/[.03] p-3 ring-1 ring-or-500/20">
          <div className="flex flex-wrap gap-2">
            <select className="input max-w-[170px] !py-1 !text-base" value={extraId} onChange={(e) => setExtraId(e.target.value)}>
              <option value="">— joueur —</option>
              {game.players.filter((p) => p.alive && !extra.some((x) => x.playerId === p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input min-w-[140px] flex-1 !py-1 !text-base" placeholder="cause" value={extraReason} onChange={(e) => setExtraReason(e.target.value)} />
            <button className="btn-ghost btn-sm" disabled={!extraId} onClick={() => { setExtra([...extra, { playerId: extraId, reason: extraReason }]); setExtraId(''); setExtraReason(''); }}>Ajouter</button>
          </div>
          {extra.map((x) => (
            <p key={x.playerId} className="flex items-center gap-1.5 text-sm"><Icon name="skull" className="h-4 w-4 text-red-300" />{name(x.playerId)} — {x.reason || 'décision du Maître du jeu'}
              <button className="ml-1 text-red-300" onClick={() => setExtra(extra.filter((y) => y !== x))}><Icon name="x" className="h-4 w-4" /></button></p>
          ))}
        </div>
      )}

      <button className="btn-gold w-full py-3 text-base" onClick={() => gm.act('validateNight', { checked, extraDeaths: extra })}>
        <Icon name="check" className="h-5 w-5" />Valider le bilan · {deaths} mort{deaths > 1 ? 's' : ''}
      </button>
    </div>
  );
}

/** Nuit validée : victimes révélées au MJ, puis lever du jour. */
function Dawn({ gm, game }: { gm: GmApi; game: GmView }) {
  const night = game.night!;
  // Le tir du Chasseur et la succession du Chef se font au matin, après l'annonce des morts : ils ne bloquent pas le lever du jour.
  const blocked = game.pendingTriggers.some((t) => t.type !== 'chief' && t.type !== 'hunter');
  const deaths = night.deaths.map((id) => game.players.find((p) => p.id === id)).filter(Boolean) as PlayerState[];
  return (
    <div className="frame overflow-hidden px-5 py-8 text-center sm:py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_60%_at_50%_120%,rgba(233,150,70,.3),transparent)]" />
      <div className="relative">
        <Icon name="sun" className="sun-glow mx-auto h-14 w-14 text-or-300" strokeWidth={1.5} />
        <p className="frame-title mt-4 justify-center after:hidden">Nuit {night.number} validée</p>
        <h2 className="mt-2 font-display text-2xl text-gold sm:text-3xl">{deaths.length ? 'Le village a perdu des siens' : 'Une nuit paisible'}</h2>
        {deaths.length > 0 && (
          <div className="stagger mt-5 flex flex-wrap justify-center gap-3">
            {deaths.map((d) => (
              <div key={d.id} className="w-24">
                <span className="relative block h-32 overflow-hidden rounded-lg ring-2 ring-sang-500/70">
                  {d.roleId && <RoleArt roleId={d.roleId} label={false} className="h-full w-full grayscale" />}
                  <span className="absolute inset-0 flex items-center justify-center bg-nuit-950/50 text-red-200"><Icon name="skull" className="h-8 w-8" /></span>
                </span>
                <span className="mt-1 block truncate text-sm text-parchemin-100">{d.name}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <button className="btn-gold px-8 py-3 text-base shadow-glow" disabled={blocked} onClick={() => gm.act('startDay')}>
            <Icon name="sun" className="h-5 w-5" />Lever le jour
          </button>
          {night.number === 1 && (
            <button className="btn-violet" disabled={blocked} onClick={() => gm.act('startNight')}><Icon name="moon" />Passer à la nuit 2</button>
          )}
        </div>
        {blocked && <p className="mt-3 text-sm text-red-300">Résolvez d’abord les conséquences en attente.</p>}
      </div>
    </div>
  );
}

function WolfChat({ game }: { game: GmView }) {
  const [open, setOpen] = useState(false);
  const msgs = game.wolfChat.filter((m) => m.night === game.night!.number);
  if (!msgs.length) return null;
  return (
    <div className="frame frame-blood p-3">
      <button className="flex w-full items-center gap-2 text-sm text-red-200" onClick={() => setOpen((o) => !o)}>
        <Icon name="chat" className="h-4 w-4" />Chat de la meute <span className="chip !py-0">{msgs.length}</span>
        <Icon name={open ? 'eyeOff' : 'eye'} className="ml-auto h-4 w-4" />
      </button>
      {open && (
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
          {msgs.map((m) => (
            <li key={m.id}><span className="text-parchemin-300/60">{fmtTime(m.at)}</span> <strong className="text-red-300">{m.fromName}</strong> : {m.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
