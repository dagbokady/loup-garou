import { useState } from 'react';
import { ROLES } from '@shared/roles';
import type { PlayerView } from '@shared/types';
import { Icon } from './Icon';
import { RoleArt } from './RoleArt';

type Vision = PlayerView['me']['visions'][number];

/** Révélation de la Voyante : la carte du joueur sondé apparaît de dos, puis se retourne. */
export function SeerReveal({ vision }: { vision: Vision }) {
  const role = vision.roleId ? ROLES[vision.roleId] : null;
  const wolf = role?.camp === 'loups' || vision.roleId === 'loupBlanc';
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <p className="cine-in text-xs uppercase tracking-[0.3em] text-mystic-400">Votre boule de cristal s’éclaire…</p>
      <div className="seer-card" key={`${vision.night}-${vision.targetId}`}>
        <div className="seer-inner">
          <img src="/assets/dos-carte.webp" alt="" className="seer-face" draggable={false} />
          <div className="seer-face seer-back">
            {vision.roleId ? <RoleArt roleId={vision.roleId} className="h-full w-full" /> : <div className="h-full w-full bg-nuit-900" />}
          </div>
        </div>
        <div className="seer-glow" />
      </div>
      <div className="seer-text">
        <p className="font-display text-2xl text-gold">{vision.name}</p>
        <p className={`mt-1 text-lg ${wolf ? 'text-red-300' : 'text-parchemin-100'}`}>est {role ? role.name : 'sans rôle'}</p>
      </div>
      <p className="seer-text text-sm text-parchemin-300/70" style={{ animationDelay: '2.4s' }}>Gardez ce secret et fermez les yeux.</p>
    </div>
  );
}

/** Carnet des visions passées de la Voyante. */
export function VisionLog({ visions }: { visions: Vision[] }) {
  const [open, setOpen] = useState<Vision | null>(null);
  if (!visions.length) return null;
  return (
    <section className="frame p-4">
      <p className="frame-title"><Icon name="eye" className="h-4 w-4" />Vos visions</p>
      <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {[...visions].reverse().map((v) => (
          <li key={v.night}>
            <button onClick={() => setOpen(v)} className="tile w-full overflow-hidden text-left">
              <span className="block aspect-[3/4]">{v.roleId && <RoleArt roleId={v.roleId} label={false} className="h-full w-full" />}</span>
              <span className="block truncate px-1.5 pt-1 text-sm">{v.name}</span>
              <span className="block px-1.5 pb-1 text-[10px] uppercase tracking-wider text-parchemin-300/60">Nuit {v.night}</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-nuit-950/90 px-4 backdrop-blur" onClick={() => setOpen(null)}>
          <SeerReveal vision={open} />
        </div>
      )}
    </section>
  );
}
