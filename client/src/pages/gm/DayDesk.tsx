import { useVerdictStage, cursedOf } from '../player/PlayerSpace';
import { useEffect, useState } from 'react';
import type { VoteKind, VoteRecord } from '@shared/types';
import { Icon } from '../../components/Icon';
import { PlayerPicker } from '../../components/PlayerPicker';
import { RoleArt } from '../../components/RoleArt';
import { DebateClock } from '../../components/DebateClock';
import type { GmApi, GmView } from '../../lib/useGm';

const nameOf = (game: GmView, id: string) => game.players.find((p) => p.id === id)?.name ?? '—';

/** Le jour, joué comme une scène : débat, vote (clos et publié automatiquement), puis tombée de la nuit. */
export function DayDesk({ gm, game }: { gm: GmApi; game: GmView }) {
  const v = game.vote;
  return (
    <div className="space-y-4">
      <div key={v ? `${v.id}-${v.status}` : 'none'} className="stage-in">
        {!v ? <Daybreak gm={gm} game={game} /> : v.status === 'open' ? <OpenVote gm={gm} game={game} vote={v} /> : <VoteResults gm={gm} game={game} vote={v} />}
      </div>
      {v?.status !== 'open' && <Nightfall gm={gm} game={game} />}
      <Announce gm={gm} game={game} />
    </div>
  );
}

function Daybreak({ gm, game }: { gm: GmApi; game: GmView }) {
  const alive = game.players.filter((p) => p.alive).map((p) => p.id);
  const [options, setOptions] = useState(false);
  const [label, setLabel] = useState('');
  const [candidates, setCandidates] = useState<string[]>(alive);
  const [voters, setVoters] = useState<string[]>(alive);
  const [duration, setDuration] = useState(60);
  // Le premier jour est réservé à l'élection du Chef du village.
  const firstDay = game.dayNumber === 1 && !game.chiefId;
  const succession = game.pendingTriggers.some((t) => t.type === 'chief');
  const open = (kind: VoteKind) => gm.act('openVote', { kind, label, candidates, voters, durationSec: duration > 0 ? duration : undefined });

  return (
    <div className="frame overflow-hidden px-5 py-8 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(233,201,111,.18),transparent)]" />
      <div className="relative">
        <Icon name="sun" className="sun-glow mx-auto h-14 w-14 text-or-300" strokeWidth={1.5} />
        <p className="frame-title mt-4 justify-center after:hidden">Jour {game.dayNumber}</p>
        <h2 className="mt-2 font-display text-2xl text-gold sm:text-3xl">Le village débat</h2>
        <p className="mx-auto mt-2 max-w-md text-parchemin-200/80">{firstDay ? 'Premier jour : le village élit son Chef. Le vote se clôt tout seul quand chacun a voté.' : 'Laissez les joueurs s’accuser à voix haute, puis lancez le vote : il se clôt tout seul quand chacun a voté.'}</p>

        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          {game.powers.ravenTarget && <span className="chip ring-1 ring-or-500/30"><Icon name="feather" className="h-3.5 w-3.5" />{nameOf(game, game.powers.ravenTarget)} : +2 voix</span>}
          {game.chiefId && <span className="chip ring-1 ring-or-500/30"><Icon name="crown" className="h-3.5 w-3.5 text-or-300" />{nameOf(game, game.chiefId)} vote double</span>}
        </div>

        <DebateControls gm={gm} game={game} />

        <p className="mt-5 text-xs uppercase tracking-[0.25em] text-parchemin-300">Durée du vote</p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          <Icon name="clock" className="h-4 w-4 text-parchemin-300" />
          {[0, 30, 60, 90, 120].map((d) => (
            <button key={d} onClick={() => setDuration(d)} className={`rounded-full px-3 py-1 text-xs ring-1 transition ${duration === d ? 'bg-or-400 text-nuit-950 ring-or-200' : 'bg-white/5 ring-or-500/25 hover:ring-or-400'}`}>{d === 0 ? 'Sans chrono' : `${d}s`}</button>
          ))}
        </div>

        <div className="mt-6 flex flex-col items-center gap-2">
          {firstDay ? (
            <button className="btn-gold w-full max-w-sm py-3 text-base shadow-glow" onClick={() => open('chef')}><Icon name="crown" className="h-5 w-5" />Élire le Chef du village</button>
          ) : (
            <>
              {succession && <p className="flex items-center gap-1.5 text-sm text-or-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />L’ancien Chef désigne son successeur avant le vote…</p>}
              <button className="btn-gold w-full max-w-sm py-3 text-base shadow-glow" disabled={succession} onClick={() => open('elimination')}><Icon name="vote" className="h-5 w-5" />Lancer le vote du village</button>
              {!game.chiefId && !succession && <button className="btn-ghost w-full max-w-sm ring-1 ring-or-500/30" onClick={() => open('chef')}><Icon name="crown" />Élire le Chef du village</button>}
            </>
          )}
          <button className="mt-1 inline-flex items-center gap-1.5 text-sm text-or-200" onClick={() => setOptions((o) => !o)}>
            <Icon name="plus" className={`h-4 w-4 transition ${options ? 'rotate-45' : ''}`} />Options du vote
          </button>
        </div>

        {options && (
          <div className="stage-in mt-3 space-y-3 rounded-lg bg-white/[.03] p-3 text-left ring-1 ring-or-500/20">
            <input className="input !text-base" placeholder="Intitulé (facultatif)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
            <div><span className="label">Peuvent être désignés ({candidates.length})</span><PlayerPicker players={game.players} value={candidates} onChange={setCandidates} max={99} /></div>
            <div><span className="label">Votants ({voters.length})</span><PlayerPicker players={game.players} value={voters} onChange={setVoters} max={99} /></div>
            <button className="btn-ghost btn-sm" onClick={() => open('autre')}>Ouvrir un vote libre</button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Minuteur de débat : lancé par le MJ, affiché sur tous les téléphones. */
function DebateControls({ gm, game }: { gm: GmApi; game: GmView }) {
  const [custom, setCustom] = useState(3);
  const set = (seconds: number, extend = false) => gm.act('debate', { seconds, extend });
  return (
    <div className="mx-auto mt-6 max-w-sm space-y-2">
      {game.debate ? (
        <>
          <DebateClock debate={game.debate} />
          <div className="flex flex-wrap justify-center gap-1.5">
            <button className="btn-ghost btn-sm ring-1 ring-or-500/30" onClick={() => set(30, true)}>+30 s</button>
            <button className="btn-ghost btn-sm ring-1 ring-or-500/30" onClick={() => set(60, true)}>+1 min</button>
            <button className="btn-ghost btn-sm ring-1 ring-sang-500/40" onClick={() => set(0)}>Arrêter</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs uppercase tracking-[0.25em] text-parchemin-300">Minuteur de débat</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {[2, 3, 5].map((m) => (
              <button key={m} className="rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-or-500/25 hover:ring-or-400" onClick={() => set(m * 60)}>{m} min</button>
            ))}
            <span className="flex items-center gap-1">
              <input type="number" min={1} max={30} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="input !w-16 !py-1 text-center !text-sm" aria-label="Minutes" />
              <button className="rounded-full bg-or-400 px-3 py-1 text-xs text-nuit-950" onClick={() => custom > 0 && set(custom * 60)}>Lancer</button>
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function OpenVote({ gm, game, vote }: { gm: GmApi; game: GmView; vote: VoteRecord }) {
  const voted = new Set(game.voteProgress?.voted ?? []);
  const total = game.voteProgress?.total ?? vote.voters.length;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!vote.closesAt) { setLeft(null); return; }
    let fired = false;
    const tick = () => {
      const r = Math.max(0, Math.round((vote.closesAt! - Date.now()) / 1000));
      setLeft(r);
      if (r === 0 && !fired) { fired = true; gm.act('closeVote'); }
    };
    tick(); const i = setInterval(tick, 500);
    return () => clearInterval(i);
  }, [vote.closesAt, gm]);
  const pct = total ? voted.size / total : 0;
  const C = 2 * Math.PI * 52;

  return (
    <div className="frame frame-live p-5 text-center sm:p-6">
      <p className="frame-title justify-center after:hidden"><Icon name="vote" className="h-4 w-4" />Vote en cours</p>
      <h3 className="mt-1 font-display text-xl text-gold">{vote.label}</h3>

      <div className="relative mx-auto mt-5 h-36 w-36">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(217,173,69,.15)" strokeWidth="8" />
          <circle cx="60" cy="60" r="52" fill="none" stroke="#e9c96f" strokeWidth="8" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s cubic-bezier(.2,.8,.2,1)', filter: 'drop-shadow(0 0 6px rgba(233,201,111,.6))' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span key={voted.size} className="pop-in font-display text-4xl text-gold">{voted.size}</span>
          <span className="text-xs text-parchemin-300/70">sur {total}</span>
        </div>
      </div>
      {left !== null && (
        <p className={`mt-3 inline-flex items-center gap-1.5 text-sm ${left < 10 ? 'animate-pulse text-red-300' : 'text-parchemin-300'}`}><Icon name="clock" className="h-4 w-4" />{left}s</p>
      )}
      <p className="mt-1 text-xs text-parchemin-300/60">
        {'Les résultats s’affichent dès que tout le monde a voté.'}
      </p>

      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5">
        {vote.voters.map((id) => (
          <span key={id} className={`flex items-center gap-1.5 truncate rounded-lg px-2 py-1.5 text-sm ring-1 transition duration-500 ${voted.has(id) ? 'bg-foret-700/30 text-foret-400 ring-foret-400/50' : 'bg-white/[.03] text-parchemin-300/50 ring-white/10'}`}>
            {voted.has(id) ? <Icon name="check" className="pop-in h-3.5 w-3.5" strokeWidth={3} /> : <Icon name="hourglass" className="h-3.5 w-3.5" />}
            <span className="truncate">{nameOf(game, id)}</span>
          </span>
        ))}
      </div>
      <div className="mt-5 flex justify-center gap-2">
        <button className="btn-gold" onClick={() => gm.act('closeVote')}><Icon name="check" />Clore maintenant</button>
        <button className="btn-ghost" onClick={() => gm.act('dismissVote')}><Icon name="x" />Annuler</button>
      </div>
    </div>
  );
}

function VoteResults({ gm, game, vote }: { gm: GmApi; game: GmView; vote: VoteRecord }) {
  const r = vote.result!;
  const max = r.entries[0]?.total ?? 0;
  const [details, setDetails] = useState(false);
  const leader = r.leaders.length === 1 ? r.leaders[0] : null;
  const lp = leader ? game.players.find((p) => p.id === leader) : null;
  const cursed = cursedOf(r);
  const { stage, curse } = useVerdictStage(vote.id, !!cursed);

  return (
    <div className="frame p-5 sm:p-6">
      <p className="frame-title"><Icon name="scale" className="h-4 w-4" />Verdict — {vote.label}</p>

      {curse && cursed && <p className="pop-in mt-4 flex items-center gap-2 text-or-200"><Icon name="feather" className="h-4 w-4" />Le Corbeau a maudit {nameOf(game, cursed)} : +2 voix.</p>}
      {stage === 0 && !curse && <p className="mt-4 flex items-center gap-2 text-parchemin-200"><Icon name="hourglass" className="h-4 w-4 animate-pulse" />Le village tranche…</p>}
      {stage >= 1 && lp && (
        <div className="pop-in mt-4 flex items-center gap-4 rounded-xl bg-sang-700/20 p-3 ring-1 ring-sang-500/50">
          <span className="h-20 w-14 shrink-0 overflow-hidden rounded-lg ring-2 ring-sang-500">{lp.roleId && <RoleArt roleId={lp.roleId} label={false} className="h-full w-full" />}</span>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-red-200/80">{vote.kind === 'chef' ? 'Élu(e)' : 'Désigné(e) par le village'}</p>
            <p className="truncate font-display text-2xl text-gold">{lp.name}</p>
          </div>
        </div>
      )}
      {stage >= 1 && r.leaders.length > 1 && <p className="pop-in mt-4 flex items-center gap-2 text-or-200"><Icon name="scale" />Égalité : à vous de trancher.</p>}

      {stage >= 2 && <>
      <ul className="stage-in mt-4 space-y-2">
        {r.entries.map((e, i) => (
          <li key={e.playerId}>
            <div className="flex items-center gap-2">
              <span className={`w-24 truncate text-sm sm:w-32 ${r.leaders.includes(e.playerId) ? 'font-semibold text-or-100' : ''}`}>{nameOf(game, e.playerId)}</span>
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-nuit-950">
                <div className={`bar-grow h-full rounded-full ${r.leaders.includes(e.playerId) ? 'bg-gradient-to-r from-sang-600 to-sang-500' : 'bg-or-600/60'}`} style={{ width: `${(e.total / Math.max(1, max)) * 100}%`, animationDelay: `${i * 0.08}s` }} />
              </div>
              <span className="w-6 text-right font-title text-or-100">{e.total}</span>
            </div>
            {details && (
              <p className="pl-[6.5rem] text-xs text-parchemin-300/70 sm:pl-[8.5rem]">
                {e.details.map((d) => `${d.from === 'corbeau' ? 'Corbeau' : nameOf(game, d.from)}${d.weight > 1 ? ` ×${d.weight}` : ''}${d.note && d.from !== 'corbeau' ? ` (${d.note})` : ''}`).join(', ')}
              </p>
            )}
          </li>
        ))}
        {!r.entries.length && <li className="text-sm italic text-parchemin-300/70">Aucune voix exprimée.</li>}
      </ul>

      <button className="mt-3 inline-flex items-center gap-1.5 text-sm text-or-200" onClick={() => setDetails((d) => !d)}>
        <Icon name={details ? 'eyeOff' : 'eye'} className="h-4 w-4" />{details ? 'Masquer le détail' : 'Détail des voix'}
      </button>
      {details && (
        <div className="mt-2 text-sm text-parchemin-300/80">
          {r.notes.map((n) => <p key={n}>• {n}</p>)}
          {r.abstentions.length > 0 && <p>Sans vote : {r.abstentions.map((id) => nameOf(game, id)).join(', ')}</p>}
        </div>
      )}
      </>}

      <div className="mt-5 flex flex-wrap gap-2">
        {stage >= 1 && vote.appliedTo && (
          <p className="flex items-center gap-2 text-sm text-parchemin-200"><Icon name={vote.kind === 'chef' ? 'crown' : 'skull'} className="h-4 w-4" />{vote.kind === 'chef' ? `${nameOf(game, vote.appliedTo)} est Chef du village.` : `${nameOf(game, vote.appliedTo)} est éliminé(e), rôle dévoilé.`}</p>
        )}
        {stage >= 1 && !vote.appliedTo && r.leaders.length > 1 && (vote.kind === 'elimination' || vote.kind === 'chef') && r.leaders.map((id) => (
          <button key={id} className={vote.kind === 'chef' ? 'btn-gold' : 'btn-danger'} onClick={() => gm.act('resolveVoteTie', { playerId: id })}>
            <Icon name={vote.kind === 'chef' ? 'crown' : 'skull'} />{vote.kind === 'chef' ? 'Nommer' : 'Éliminer'} {nameOf(game, id)}
          </button>
        ))}
        {stage >= 1 && !vote.appliedTo && r.leaders.length > 1 && (vote.kind === 'elimination' || vote.kind === 'chef') && (
          <button className="btn-gold" onClick={() => gm.act('openVote', {
            kind: vote.kind,
            label: `${vote.kind === 'chef' ? 'Élection du Chef' : 'Vote du village'} — départage`,
            candidates: r.leaders,
            voters: game.players.filter((p) => p.alive).map((p) => p.id),
            durationSec: vote.closesAt ? Math.round((vote.closesAt - vote.openedAt) / 1000) : undefined,
          })}>
            <Icon name="vote" />Revoter entre les ex æquo
          </button>
        )}
        <button className="btn-ghost btn-sm ml-auto" onClick={() => gm.act('dismissVote')}><Icon name="undo" className="h-3.5 w-3.5" />Nouveau vote</button>
      </div>
    </div>
  );
}

function Nightfall({ gm, game }: { gm: GmApi; game: GmView }) {
  const blocked = game.pendingTriggers.length > 0;
  return (
    <>
      <button disabled={blocked} onClick={() => gm.act('startNight')} className="frame group flex w-full items-center gap-4 p-4 text-left transition hover:brightness-125 disabled:opacity-50">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-mystic-800/70 text-mystic-400 ring-1 ring-mystic-500/50 transition group-hover:shadow-glow-violet">
          <Icon name="moon" className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-title text-or-100">Tombée de la nuit</span>
          <span className="block text-sm text-parchemin-300/70">{blocked ? 'Résolvez d’abord les conséquences en attente' : `Endormir le village et lancer la nuit ${game.nightNumber + 1}`}</span>
        </span>
        <Icon name="arrowRight" className="h-5 w-5 text-or-300 transition group-hover:translate-x-1" />
      </button>
    </>
  );
}

/** Annonce publique et votes précédents. */
function Announce({ gm, game }: { gm: GmApi; game: GmView }) {
  const [text, setText] = useState('');
  return (
    <div className="frame space-y-3 p-4">
      <p className="frame-title"><Icon name="megaphone" className="h-4 w-4" />Annonce au village</p>
      <div className="flex gap-2">
        <input className="input !py-1.5 !text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder="Visible par tous les joueurs" maxLength={500} />
        <button className="icon-btn !h-auto !w-11" disabled={!text.trim()} title="Annoncer" onClick={async () => { if ((await gm.act('announce', { text })).ok) setText(''); }}><Icon name="send" /></button>
      </div>
      {game.votes.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-or-200">Votes précédents ({game.votes.length})</summary>
          <ul className="mt-2 space-y-1">
            {[...game.votes].reverse().map((x) => (
              <li key={x.id}><strong>{x.label}</strong> — {x.result?.entries.map((e) => `${nameOf(game, e.playerId)} ${e.total}`).join(', ') || 'aucune voix'}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
