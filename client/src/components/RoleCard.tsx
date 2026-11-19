import { ROLES } from '@shared/roles';
import type { RoleId } from '@shared/types';
import { Icon } from './Icon';
import { RoleArt } from './RoleArt';

/** Carte de rôle secrète, retournable d'un toucher. */
export function RoleCard({
  roleId,
  revealed,
  onToggle,
  dead,
  lover,
  locked,
}: {
  roleId: RoleId | null;
  revealed: boolean;
  onToggle?: () => void;
  dead?: boolean;
  /** Partenaire uni par Cupidon : un cœur s'affiche en haut de la carte avec son nom. */
  lover?: { name: string; alive: boolean } | null;
  /** Carte bloquée face cachée (la nuit, quand le joueur n'est pas appelé) */
  locked?: boolean;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[280px] pt-4">
    {lover && (
      <span className="lover-badge absolute left-1/2 top-0 z-10 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-gradient-to-r from-pink-700 to-sang-600 px-3 py-1 text-sm font-medium text-white shadow-[0_0_20px_rgba(236,72,153,.55)] ring-2 ring-pink-300/70">
        <Icon name={lover.alive ? 'heart' : 'heartCrack'} className="h-4 w-4 fill-pink-200/40" />
        {lover.name}
      </span>
    )}
    <button
      type="button"
      onClick={locked ? undefined : onToggle}
      disabled={locked}
      className={`flip group relative mx-auto block aspect-[2/3] w-full max-w-[280px] ${revealed && !locked ? 'is-flipped' : ''} ${locked ? 'cursor-not-allowed' : ''}`}
      aria-label={revealed ? 'Cacher ma carte' : 'Révéler ma carte'}
    >
      <div className="flip-inner relative h-full w-full">
        <div className="flip-face absolute inset-0 overflow-hidden rounded-2xl border-2 border-or-400/70 shadow-glow">
          <img src="/assets/dos-carte.webp" alt="Dos de carte" className="h-full w-full object-cover" draggable={false} />
          <span className="absolute inset-x-0 bottom-5 mx-auto w-max rounded-full bg-nuit-950/80 px-3 py-1 font-title text-xs uppercase tracking-widest text-or-200 transition group-hover:bg-nuit-800">
            {locked ? '🌙 Carte face cachée' : 'Toucher pour révéler'}
          </span>
        </div>
        <div className="flip-face flip-back absolute inset-0 overflow-hidden rounded-2xl border-2 border-or-400/70 shadow-glow">
          {roleId ? (
            <RoleArt roleId={roleId} className={`h-full w-full ${dead ? 'grayscale' : ''}`} />
          ) : (
            <div className="flex h-full items-center justify-center bg-nuit-900 p-4 text-center font-title text-or-200">
              Le Maître du jeu n’a pas encore distribué les rôles
            </div>
          )}
          {dead && (
            <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 rotate-[-12deg] bg-sang-700/80 py-1 text-center font-display text-xl text-parchemin-50">
              Éliminé
            </span>
          )}
        </div>
      </div>
      <span className="sr-only">{roleId ? ROLES[roleId].name : ''}</span>
    </button>
    </div>
  );
}
