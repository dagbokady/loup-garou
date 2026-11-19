import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { CAMP_LABELS, ROLES, ROLE_ORDER, campCounts, compositionTotal, suggestComposition } from '@shared/roles';
import type { Camp, RoleId } from '@shared/types';
import { CAMP_STYLE } from '../../components/CampBadge';
import { Confirm } from '../../components/Modal';
import { RoleArt } from '../../components/RoleArt';
import { usePublicOrigin } from '../../lib/publicOrigin';
import type { GmApi, GmView } from '../../lib/useGm';
import { PresetBar } from './PresetBar';

const CAMPS: Camp[] = ['village', 'loups', 'mercenaires', 'variable'];

/**
 * Préparation de la partie en trois étapes simples :
 * 1. les joueurs rejoignent (code + QR code), 2. la composition des rôles, 3. la distribution et le lancement.
 */
export function Preparation({ gm, game }: { gm: GmApi; game: GmView }) {
  const comp = game.composition;
  const total = compositionTotal(comp);
  const joined = game.players.length;
  const expected = game.settings.expectedPlayers;
  const camps = campCounts(comp);
  const [cancel, setCancel] = useState(false);
  const [step, setStep] = useState(0);

  const setCount = (id: RoleId, n: number) => gm.act('composition', { composition: { ...comp, [id]: Math.max(0, n) } });

  const checks = [
    { ok: joined === expected, text: `${joined} / ${expected} joueurs présents` },
    { ok: total === expected, text: `${total} rôle(s) pour ${expected} joueurs` },
    { ok: game.rolesDistributed, text: game.rolesDistributed ? 'Rôles distribués' : 'Rôles à distribuer' },
  ];
  const steps = [
    { label: 'Joueurs', status: `${joined}/${expected}`, ok: checks[0].ok },
    { label: 'Rôles', status: `${total}/${expected}`, ok: checks[1].ok },
    { label: 'Lancement', status: game.rolesDistributed ? 'prêt' : '', ok: checks.every((c) => c.ok) },
  ];

  return (
    <div className="mx-auto max-w-4xl animate-rise">
      {/* Étapes */}
      <ol className="mb-4 grid grid-cols-3 gap-2">
        {steps.map((s, i) => (
          <li key={s.label}>
            <button
              onClick={() => setStep(i)}
              className={`w-full rounded-xl border px-2 py-2 text-center transition ${step === i ? 'border-or-300 bg-or-400/15 shadow-glow' : 'border-or-500/25 bg-nuit-950/50 hover:border-or-400/60'}`}
            >
              <span className="block font-title text-[11px] uppercase tracking-widest text-or-300/80">{i + 1} · {s.label}</span>
              <span className={`font-title text-sm ${s.ok ? 'text-foret-400' : 'text-parchemin-200'}`}>{s.ok ? '✔ ' : ''}{s.status}</span>
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <JoinCard code={game.code} />
          <section className="panel p-4">
            <h2 className="panel-title">Les âmes présentes</h2>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-parchemin-200">Joueurs attendus</span>
              <Stepper value={expected} min={3} max={40} onChange={(v) => gm.act('settings', { settings: { expectedPlayers: v } })} />
            </div>
            <ul className="mt-3 space-y-1">
              {game.players.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-or-400/5">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${p.connected ? 'bg-foret-400' : 'bg-parchemin-300/30'}`} />
                  <span className="w-5 font-title text-xs text-or-300/70">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <button className="px-1 text-or-300 disabled:opacity-20" disabled={i === 0} onClick={() => move(gm, game, i, -1)} aria-label="Monter">▲</button>
                  <button className="px-1 text-or-300 disabled:opacity-20" disabled={i === game.players.length - 1} onClick={() => move(gm, game, i, 1)} aria-label="Descendre">▼</button>
                  <button className="px-1 text-red-300/70 hover:text-red-300" onClick={() => gm.act('kick', { playerId: p.id })} aria-label={`Retirer ${p.name}`}>✕</button>
                </li>
              ))}
              {!game.players.length && <li className="py-8 text-center italic text-parchemin-300/60">En attente des premiers villageois…</li>}
            </ul>
            <p className="mt-3 text-xs text-parchemin-300/60">L’ordre est celui de la table (utilisé par le Renard).</p>
            <button className="btn-gold mt-4 w-full" onClick={() => setStep(1)}>Composer les rôles →</button>
          </section>
        </div>
      )}

      {step === 1 && (
        <section className="panel p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-violet btn-sm" onClick={() => gm.act('composition', { composition: suggestComposition(expected) })}>✧ Proposition pour {expected} joueurs</button>
            <button className="btn-ghost btn-sm" onClick={() => gm.act('composition', { composition: {} })}>Tout retirer</button>
            <span className={`ml-auto font-title ${total === expected ? 'text-foret-400' : 'text-or-300'}`}>{total} / {expected}</span>
          </div>
          <PresetBar current={comp} apply={(c) => gm.act('composition', { composition: c })} />
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-nuit-950">
            {CAMPS.map((c) => camps[c] ? <div key={c} className={CAMP_STYLE[c].split(' ').find((x) => x.startsWith('bg-'))} style={{ width: `${(camps[c] / Math.max(total, 1)) * 100}%` }} /> : null)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {CAMPS.filter((c) => camps[c]).map((c) => <span key={c} className={`chip ${CAMP_STYLE[c]}`}>{CAMP_LABELS[c].replace('Camp des ', '').replace('Camp ', '')} · {camps[c]}</span>)}
          </div>
          <div className="mt-4 space-y-4">
            {CAMPS.map((camp) => (
              <div key={camp}>
                <h3 className="mb-1.5 font-title text-xs uppercase tracking-widest text-or-300/70">{CAMP_LABELS[camp]}</h3>
                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(min(230px,100%),1fr))]">
                  {ROLE_ORDER.filter((id) => ROLES[id].camp === camp).map((id) => {
                    const n = comp[id] ?? 0;
                    return (
                      <div key={id} className={`flex items-center gap-2.5 rounded-lg border p-1 pr-2 ${n ? 'border-or-400/50 bg-or-500/10' : 'border-transparent'}`}>
                        <span className={`h-11 w-8 shrink-0 overflow-hidden rounded border border-or-500/40 ${n ? '' : 'opacity-50'}`}>
                          <RoleArt roleId={id} label={false} className="h-full w-full" />
                        </span>
                        <span className={`flex-1 leading-tight ${n ? 'text-parchemin-50' : 'text-parchemin-300/70'}`}>{ROLES[id].name}</span>
                        <button className="btn-ghost btn-sm h-7 w-7 !p-0" disabled={n === 0} onClick={() => setCount(id, n - 1)} aria-label={`Retirer ${ROLES[id].name}`}>−</button>
                        <span className="w-4 text-center font-title text-or-100">{n}</span>
                        <button className="btn-ghost btn-sm h-7 w-7 !p-0" disabled={!ROLES[id].multiple && n >= 1} onClick={() => setCount(id, n + 1)} aria-label={`Ajouter ${ROLES[id].name}`}>+</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {(comp.joueurDeFlute ?? 0) > 0 && (
            <div className="mt-4 flex items-center justify-between rounded-lg border border-or-500/20 px-3 py-2">
              <span className="text-sm">Enchantements par nuit (Joueur de Flûte)</span>
              <Stepper value={game.settings.piperCharmCount} min={1} max={5} onChange={(v) => gm.act('settings', { settings: { piperCharmCount: v } })} />
            </div>
          )}
          <button className="btn-gold mt-5 w-full" onClick={() => setStep(2)}>Distribuer les rôles →</button>
        </section>
      )}

      {step === 2 && (
        <section className="panel p-4 sm:p-5">
          <div className="flex flex-wrap gap-2">
            <button className="btn-violet" disabled={!joined || total !== joined} onClick={() => gm.act('distribute')}>🎲 Distribuer au hasard</button>
            <button className="btn-ghost" disabled={!game.players.some((p) => p.roleId)} onClick={() => gm.act('clearRoles')}>Effacer</button>
          </div>
          <p className="mt-2 text-sm text-parchemin-300/70">Ou attribuez chaque rôle à la main :</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {game.players.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-lg border border-or-500/15 px-2 py-1">
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <select
                  className="w-36 min-w-0 rounded border border-or-500/30 bg-nuit-950 px-1 py-1 text-sm"
                  value={p.roleId ?? ''}
                  onChange={(e) => gm.act('assignRole', { playerId: p.id, roleId: e.target.value || null })}
                  aria-label={`Rôle de ${p.name}`}
                >
                  <option value="">— rôle —</option>
                  {ROLE_ORDER.filter((id) => (comp[id] ?? 0) > 0).map((id) => <option key={id} value={id}>{ROLES[id].name}</option>)}
                </select>
              </li>
            ))}
          </ul>
          <ul className="mt-5 space-y-0.5 text-sm">
            {checks.map((c) => <li key={c.text} className={c.ok ? 'text-foret-400' : 'text-or-200/80'}>{c.ok ? '✔' : '◌'} {c.text}</li>)}
          </ul>
          <button className="btn-gold mt-4 w-full py-3 text-base" disabled={!checks.every((c) => c.ok)} onClick={() => gm.act('start')}>🌙 Lancer la partie</button>
        </section>
      )}

      <div className="mt-6 text-center">
        <button className="text-sm text-parchemin-300/60 underline underline-offset-4 hover:text-red-300" onClick={() => setCancel(true)}>Annuler la partie</button>
      </div>
      <Confirm
        open={cancel}
        onClose={() => setCancel(false)}
        title="Annuler la partie ?"
        message="La partie sera archivée comme annulée et les joueurs verront qu’elle est terminée."
        confirmLabel="Annuler la partie"
        danger
        onConfirm={() => gm.act('cancel')}
      />
    </div>
  );
}

function move(gm: GmApi, game: GmView, i: number, d: number) {
  const ids = game.players.map((p) => p.id);
  [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
  gm.act('reorder', { ids });
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button className="btn-ghost btn-sm h-8 w-8 !p-0" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="w-8 text-center font-title text-lg text-or-100">{value}</span>
      <button className="btn-ghost btn-sm h-8 w-8 !p-0" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function JoinCard({ code }: { code: string }) {
  const net = usePublicOrigin();
  const url = `${net.origin}/jouer?code=${code}`;
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 360, color: { dark: '#0b1030', light: '#f3e9cf' } }).then(setQr).catch(() => setQr(''));
  }, [url]);
  return (
    <div className="panel p-4 text-center">
      <h2 className="panel-title">Code de la partie</h2>
      <div className="mt-3 font-display text-5xl tracking-[0.18em] text-gold">{code}</div>
      {qr && <img src={qr} alt={`QR code pour rejoindre la partie ${code}`} className="mx-auto mt-4 w-44 rounded-lg border-4 border-or-400/70" />}
      <p className="mt-3 break-all text-sm text-parchemin-200">{url}</p>
      <button
        className="btn-ghost btn-sm mt-2"
        onClick={() => {
          navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {});
        }}
      >
        {copied ? 'Lien copié ✔' : 'Copier le lien'}
      </button>
      {net.isLocal && net.addresses.length > 1 && (
        <label className="mt-3 block text-left text-xs text-or-300/80">
          Adresse réseau utilisée
          <select className="input mt-1 !py-1 !text-sm" value={net.current} onChange={(e) => net.choose(e.target.value)}>
            {net.addresses.map((ip) => <option key={ip} value={ip}>{ip}</option>)}
          </select>
        </label>
      )}
      {net.isLocal && net.missing && (
        <p className="mt-2 text-xs text-red-300">Aucune adresse réseau détectée : connectez cet ordinateur au Wi-Fi pour que les téléphones puissent rejoindre.</p>
      )}
      {net.isLocal && !net.missing && (
        <p className="mt-2 text-xs text-or-300/70">Les joueurs doivent être connectés au même Wi-Fi que cet ordinateur.</p>
      )}
    </div>
  );
}
