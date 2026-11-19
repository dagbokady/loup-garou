import { ROLES } from '@shared/roles';
import type { RoleId } from '@shared/types';

/**
 * Illustration d'un rôle. Le Simple Villageois n'a pas encore d'illustration dédiée :
 * on compose une carte à partir du dos de carte et d'un emblème.
 */
export function RoleArt({ roleId, className = '', label = true }: { roleId: RoleId; className?: string; label?: boolean }) {
  const role = ROLES[roleId];
  if (role.image) return <img src={role.image} alt={role.name} className={`object-cover ${className}`} loading="lazy" draggable={false} />;
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img src="/assets/dos-carte.webp" alt="" className="absolute inset-0 h-full w-full object-cover brightness-75 hue-rotate-[200deg] saturate-50" draggable={false} />
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-foret-900/40">
        <svg viewBox="0 0 64 64" className="h-1/3 w-1/3 drop-shadow-[0_0_12px_rgba(233,201,111,0.6)]" aria-hidden>
          <path d="M8 34 32 14l24 20" fill="none" stroke="#e9c96f" strokeWidth="3" strokeLinejoin="round" />
          <rect x="16" y="32" width="32" height="22" fill="none" stroke="#e9c96f" strokeWidth="3" />
          <rect x="28" y="40" width="8" height="14" fill="#e9c96f" />
          <circle cx="47" cy="12" r="5" fill="#f3dfa2" />
        </svg>
        {label && (
          <span className="mt-2 rounded border border-or-500/60 bg-parchemin-100/90 px-3 py-0.5 font-title text-[10px] font-bold uppercase tracking-widest text-nuit-900 sm:text-xs">
            {role.name}
          </span>
        )}
      </div>
    </div>
  );
}

export function RoleThumb({ roleId, size = 40 }: { roleId: RoleId; size?: number }) {
  return (
    <span className="inline-block shrink-0 overflow-hidden rounded-md border border-or-500/60 shadow" style={{ width: size, height: size * 1.4 }}>
      <RoleArt roleId={roleId} label={false} className="h-full w-full" />
    </span>
  );
}
