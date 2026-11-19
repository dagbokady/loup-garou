import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ROLES } from '@shared/roles';
import type { PlayerState } from '@shared/types';
import { CampBadge } from '../../components/CampBadge';
import { Icon } from '../../components/Icon';
import { Modal } from '../../components/Modal';
import { RoleArt } from '../../components/RoleArt';
import { TableScene, seatPosition, seatSize } from '../../components/TableScene';
import { usePublicOrigin } from '../../lib/publicOrigin';
import type { GmApi, GmView } from '../../lib/useGm';

/** Badges d'état d'un joueur, visibles uniquement par le Maître du jeu. */
function badges(game: GmView, p: PlayerState) {
  const b: { i: string; c: string; title: string }[] = [];
  if (game.chiefId === p.id) b.push({ i: 'crown', c: 'text-or-300', title: 'Chef du village' });
  if (game.powers.lovers?.includes(p.id)) b.push({ i: 'heart', c: 'text-pink-300', title: 'Amoureux' });
  if (p.charmed) b.push({ i: 'music', c: 'text-teal-300', title: 'Enchanté' });
  if (game.powers.ravenTarget === p.id) b.push({ i: 'feather', c: 'text-parchemin-200', title: '+2 voix au prochain vote (Corbeau)' });
  if (game.powers.salvateurLastTarget === p.id && game.powers.salvateurLastNight === game.nightNumber - (game.phase === 'night' ? 1 : 0))
    b.push({ i: 'shield', c: 'text-sky-300', title: 'Protégé lors de la dernière nuit' });
  if (p.roleId !== p.originalRoleId) b.push({ i: 'paw', c: 'text-red-300', title: 'Transformé par le Loup Noir' });
  if (p.roleId === 'ancien' && game.powers.ancienAttacks > 0) b.push({ i: 'shieldPlus', c: 'text-or-200', title: 'A survécu à une attaque' });
  return b;
}

/** Le Village : la grande table ronde (illustration), chaque joueur sur une chaise, chaque joueur assis à sa place (ordre des places, sens horaire). */
export function VillageMap({ gm, game }: { gm: GmApi; game: GmView }) {
  const [selected, setSelected] = useState<string | null>(null);
  const players = [...game.players].sort((a, b) => a.seat - b.seat);
  const sel = game.players.find((p) => p.id === selected) ?? null;
  const n = players.length;
  const alive = players.filter((p) => p.alive).length;
  const night = game.phase === 'night';
  const token = seatSize(n);
  const showNames = n <= 24;
  const host = game.phase === 'night' ? game.night?.actions.filleDeJoie?.targets[0] : undefined;

  return (
    <section className="lg:sticky lg:top-20">
      <TableScene
        night={night}
        className="mx-auto max-w-[620px]"
        center={<>
          <span className="flex items-center gap-1 font-display text-sm text-gold sm:text-base"><Icon name={night ? 'moon' : 'sun'} className={`h-4 w-4 ${night ? 'text-mystic-400' : 'text-or-300'}`} />{night ? `Nuit ${game.nightNumber}` : `Jour ${game.dayNumber}`}</span>
          <span className="text-[10px] text-parchemin-300/90 sm:text-xs">{alive} en vie · {n - alive} mort{n - alive > 1 ? 's' : ''}</span>
        </>}
      >
        {players.map((p, i) => {
          const { left: x, top: y } = seatPosition(i, n);
          const b = badges(game, p).filter((x) => x.i !== 'crown' && x.i !== 'heart');
          const isChief = game.chiefId === p.id;
          const inLove = !!game.powers.lovers?.includes(p.id);
          return (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              title={`${p.name} — place ${p.seat + 1}${host === p.id ? ' — la Fille de joie dort ici' : ''}`}
              className="seat-in group absolute block -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${x}%`, top: `${y}%`, width: `${token}%`, animationDelay: `${i * 40}ms` }}
            >
              {isChief && <Icon name="crown" className="absolute -top-[55%] left-1/4 z-10 h-1/2 w-1/2 text-or-300 drop-shadow-[0_0_6px_rgba(234,179,8,.8)]" />}
              {host === p.id && <span className="absolute -right-2 -top-2 z-10 text-[clamp(10px,1.4vw,16px)] drop-shadow" aria-label="Fille de joie">💋</span>}
              <span className={`relative block aspect-square w-full overflow-hidden rounded-full bg-nuit-900 shadow-[0_4px_10px_rgba(0,0,0,.7)] transition duration-200 group-hover:scale-110 group-hover:shadow-glow ${inLove ? 'ring-[3px] ring-pink-400 shadow-[0_0_14px_rgba(236,72,153,.7)]' : isChief ? 'ring-[3px] ring-or-300 shadow-glow' : p.alive ? 'ring-2 ring-or-400/70' : 'ring-2 ring-sang-500/60'} ${isChief && inLove ? 'outline outline-2 outline-offset-2 outline-or-300' : ''} ${selected === p.id ? 'scale-110 ring-or-200' : ''}`}>
                {p.roleId && <RoleArt roleId={p.roleId} label={false} className={`h-full w-full ${p.alive ? '' : 'grayscale brightness-50'}`} />}
                {!p.alive && <span className="absolute inset-0 flex items-center justify-center text-red-200/90"><Icon name="skull" className="h-1/2 w-1/2" /></span>}
              </span>
              <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-nuit-950 ${p.connected ? 'bg-foret-400' : 'bg-parchemin-300/40'}`} />
              {b.length > 0 && (
                <span className="absolute -left-1 -top-1 flex">
                  {b.slice(0, 2).map((x) => (
                    <span key={x.title} className={`flex h-4 w-4 items-center justify-center rounded-full bg-nuit-950/90 ring-1 ring-white/10 ${x.c}`}><Icon name={x.i} className="h-2.5 w-2.5" /></span>
                  ))}
                </span>
              )}
              {showNames && (
                <span className={`absolute left-1/2 top-[102%] max-w-[220%] -translate-x-1/2 whitespace-nowrap truncate rounded bg-nuit-950/85 px-1 text-[9px] leading-tight sm:text-[11px] ${p.alive ? 'text-parchemin-50' : 'text-parchemin-300 line-through'}`}>{p.name}</span>
              )}
            </button>
          );
        })}
      </TableScene>
      <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-parchemin-300/50"><Icon name="info" className="h-3.5 w-3.5" />Touchez un joueur pour voir sa carte et agir</p>
      {sel && <PlayerModal gm={gm} game={game} player={sel} onClose={() => setSelected(null)} />}
    </section>
  );
}

const REASONS = ['éliminé(e) par le vote du village', 'abattu(e) par le Chasseur', 'mort(e) de chagrin', 'décision du Maître du jeu'];

function PlayerModal({ gm, game, player: p, onClose }: { gm: GmApi; game: GmView; player: PlayerState; onClose: () => void }) {
  const [reason, setReason] = useState(REASONS[0]);
  const [whisper, setWhisper] = useState('');
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const role = p.roleId ? ROLES[p.roleId] : null;
  const net = usePublicOrigin();

  useEffect(() => {
    if (!link) return;
    QRCode.toDataURL(link, { margin: 1, width: 320, color: { dark: '#0b1030', light: '#f3e9cf' } }).then(setQr).catch(() => setQr(''));
  }, [link]);

  const getLink = async () => {
    const res = await gm.act<{ token: string }>('playerLink', { playerId: p.id });
    if (res.ok && res.data) setLink(`${net.origin}/jouer?reprise=${encodeURIComponent(res.data.token)}`);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignoré */ } };

  return (
    <Modal open onClose={onClose} title={p.name}>
      <div className="flex gap-4">
        {p.roleId && (
          <span className="pop-in w-24 shrink-0 overflow-hidden rounded-lg ring-2 ring-or-400/60 shadow-glow sm:w-28">
            <RoleArt roleId={p.roleId} className={`aspect-[2/3] w-full ${p.alive ? '' : 'grayscale'}`} />
          </span>
        )}
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-title text-lg text-or-100">{role?.name ?? 'Sans rôle'}</span>
            {role && <CampBadge camp={p.roleId === 'chienLoup' && game.powers.chienLoupCamp ? (game.powers.chienLoupCamp === 'loups' ? 'loups' : 'village') : role.camp} />}
          </div>
          {p.originalRoleId && p.originalRoleId !== p.roleId && <p className="text-sm">Rôle initial : {ROLES[p.originalRoleId].name}</p>}
          <p className={`flex items-center gap-1.5 text-sm ${p.alive ? 'text-foret-400' : 'text-red-300'}`}>
            <Icon name={p.alive ? 'heart' : 'skull'} className="h-4 w-4" />{p.alive ? 'En vie' : `Éliminé(e) — ${p.deathReason ?? ''} (${p.deathRound ?? ''})`}
          </p>
          <p className="flex items-center gap-1.5 text-sm text-parchemin-300"><Icon name="wifi" className={`h-4 w-4 ${p.connected ? 'text-foret-400' : 'text-parchemin-300/40'}`} />{p.connected ? 'Connecté(e)' : 'Déconnecté(e)'} · place {p.seat + 1}</p>
          <div className="flex flex-wrap gap-1 pt-1">{badges(game, p).map((b) => <span key={b.title} className="chip ring-1 ring-or-500/30"><Icon name={b.i} className={`h-3.5 w-3.5 ${b.c}`} />{b.title}</span>)}</div>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {p.alive ? (
          <div className="frame frame-blood p-3">
            <p className="frame-title !text-red-200/80"><Icon name="skull" className="h-4 w-4" />Éliminer</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {REASONS.map((r) => (
                <button key={r} className={`rounded-lg px-2 py-1.5 text-left text-xs ring-1 transition ${reason === r ? 'bg-sang-600/60 text-white ring-sang-500' : 'bg-white/5 text-parchemin-200 ring-white/10 hover:ring-sang-500/60'}`} onClick={() => setReason(r)}>{r}</button>
              ))}
            </div>
            <input className="input mt-2 !text-base" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={120} />
            <button className="btn-danger mt-2 w-full" onClick={async () => { if ((await gm.act('eliminate', { playerId: p.id, reason, cause: reason.includes('vote') ? 'vote' : undefined })).ok) onClose(); }}>
              <Icon name="skull" />Éliminer {p.name}
            </button>
          </div>
        ) : (
          <button className="btn-ghost w-full ring-1 ring-foret-400/40" onClick={() => gm.act('revive', { playerId: p.id })}><Icon name="undo" />Corriger : ramener à la vie</button>
        )}

        <div className="grid grid-cols-2 gap-2">
          {p.alive && game.chiefId !== p.id && <button className="btn-gold btn-sm py-2" onClick={() => gm.act('setChief', { playerId: p.id })}><Icon name="crown" className="h-3.5 w-3.5" />Nommer Chef</button>}
          {game.chiefId === p.id && <button className="btn-ghost btn-sm py-2" onClick={() => gm.act('setChief', { playerId: null })}><Icon name="crown" className="h-3.5 w-3.5" />Retirer Chef</button>}
          <button className="btn-ghost btn-sm py-2" onClick={() => gm.act('setCharmed', { playerId: p.id, charmed: !p.charmed })}><Icon name="music" className="h-3.5 w-3.5" />{p.charmed ? 'Désenchanter' : 'Enchanter'}</button>
        </div>

        <div className="frame p-3">
          <p className="frame-title"><Icon name="mail" className="h-4 w-4" />Murmure privé</p>
          <div className="mt-2 flex gap-2">
            <input className="input !text-base" value={whisper} onChange={(e) => setWhisper(e.target.value)} placeholder="Visible uniquement par ce joueur" maxLength={500} />
            <button className="icon-btn !h-auto !w-11" disabled={!whisper.trim()} title="Envoyer" onClick={async () => { if ((await gm.act('whisper', { playerId: p.id, text: whisper })).ok) setWhisper(''); }}><Icon name="send" /></button>
          </div>
          {p.whispers.length > 0 && (
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-sm text-parchemin-200">{p.whispers.map((w) => <li key={w.id}>« {w.text} »</li>)}</ul>
          )}
        </div>

        <div className="frame p-3">
          <p className="frame-title"><Icon name="qr" className="h-4 w-4" />Reconnexion</p>
          {link ? (
            <div className="stage-in mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              {qr ? <img src={qr} alt="QR de reprise" className="pop-in h-40 w-40 shrink-0 rounded-lg ring-2 ring-or-400/60" /> : <span className="h-40 w-40 shrink-0 animate-pulse rounded-lg bg-white/5" />}
              <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
                <p className="text-sm text-parchemin-200">Faites scanner ce QR par <strong>{p.name}</strong> pour qu’il reprenne sa place.</p>
                <p className="break-all rounded bg-nuit-950/70 p-2 text-[11px] text-parchemin-300/80 ring-1 ring-or-500/20">{link}</p>
                <button className="btn-ghost btn-sm" onClick={copy}><Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />{copied ? 'Copié' : 'Copier le lien'}</button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost btn-sm mt-2" onClick={getLink}><Icon name="qr" className="h-3.5 w-3.5" />Générer le QR de reprise</button>
          )}
          <p className="mt-2 text-xs text-parchemin-300/60">À montrer uniquement à ce joueur s’il a perdu sa session (autre appareil, navigateur vidé).</p>
        </div>
      </div>
    </Modal>
  );
}
