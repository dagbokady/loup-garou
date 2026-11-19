import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CAMP_LABELS, ROLES, ROLE_ORDER } from '@shared/roles';
import type { RoleId } from '@shared/types';
import { CampBadge } from './CampBadge';
import { Modal } from './Modal';
import { RoleArt } from './RoleArt';

/** Fiche complète d'un rôle (utilisée aussi par l'espace joueur). */
export function RoleSheetView({ roleId }: { roleId: RoleId }) {
  const r = ROLES[roleId];
  return (
    <div className="grid gap-5 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto w-40 overflow-hidden rounded-lg sm:w-full">
        <RoleArt roleId={roleId} className="aspect-[2/3] w-full" />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-2xl text-gold">{r.name}</h3>
          <CampBadge camp={r.camp} />
        </div>
        <p className="italic text-parchemin-300/70">« {r.tagline} »</p>
        <p>{r.description}</p>
        <Section title="Pouvoirs" items={r.powers} />
        <div>
          <p className="label">Victoire</p>
          <p>{r.victory}</p>
        </div>
        <Section title="Règles" items={r.rules} />
      </div>
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="label">{title}</p>
      <ul className="space-y-1">
        {items.map((t) => <li key={t} className="flex gap-2"><span className="text-or-400">✦</span>{t}</li>)}
      </ul>
    </div>
  );
}

type Page = 'intro' | 'sommaire' | RoleId;

/**
 * Grimoire : un vrai livre. Chaque page est un feuillet qui pivote autour de la reliure
 * (gauche), avec ombre portée et verso en parchemin. Glisser du doigt pour tourner.
 */
export function Grimoire({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pages = useMemo<Page[]>(() => ['intro', 'sommaire', ...ROLE_ORDER], []);
  const [idx, setIdx] = useState(0);
  const [turn, setTurn] = useState<{ dir: 'next' | 'prev'; to: number } | null>(null);
  const touch = useRef<number | null>(null);

  const go = useCallback((dir: 'next' | 'prev', target?: number) => {
    setTurn((t) => {
      if (t) return t;
      const to = target ?? idx + (dir === 'next' ? 1 : -1);
      if (to < 0 || to >= pages.length || to === idx) return t;
      return { dir, to };
    });
  }, [idx, pages.length]);

  useEffect(() => {
    if (!turn) return;
    const id = setTimeout(() => { setIdx(turn.to); setTurn(null); }, 850);
    return () => clearTimeout(id);
  }, [turn]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go('next');
      if (e.key === 'ArrowLeft') go('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, go]);

  if (!open) return null;
  // Pendant un tournage : « next » → le dessous montre déjà la page suivante, le feuillet emporte l'actuelle ;
  // « prev » → le dessous garde l'actuelle, le feuillet ramène la précédente par-dessus.
  const under = turn?.dir === 'next' ? turn.to : idx;
  const leaf = turn ? (turn.dir === 'next' ? idx : turn.to) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-nuit-950/90 p-2 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div className="relative w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <select className="input max-w-[220px] !py-1 !text-sm" value={idx} onChange={(e) => { const t = Number(e.target.value); go(t > idx ? 'next' : 'prev', t); }}>
            {pages.map((p, i) => <option key={p} value={i}>{p === 'intro' ? 'Introduction' : p === 'sommaire' ? 'Sommaire' : ROLES[p].name}</option>)}
          </select>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">✕ Fermer</button>
        </div>
        <div
          className="book relative mx-auto"
          onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touch.current == null) return;
            const dx = e.changedTouches[0].clientX - touch.current;
            touch.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 'next' : 'prev');
          }}
        >
          <Sheet page={pages[under]} index={under} total={pages.length} />
          {leaf !== null && turn && (
            <div className={`book-leaf ${turn.dir === 'next' ? 'leaf-next' : 'leaf-prev'}`}>
              <div className="book-face"><Sheet page={pages[leaf]} index={leaf} total={pages.length} /></div>
              <div className="book-face book-back" />
              <div className="book-shade" />
            </div>
          )}
          {turn && <div className={`book-cast ${turn.dir === 'next' ? 'cast-next' : 'cast-prev'}`} />}
          {/* Coins cliquables pour tourner */}
          <button aria-label="Page précédente" className="absolute inset-y-0 left-0 z-20 w-12 sm:w-16" onClick={() => go('prev')} disabled={idx === 0} />
          <button aria-label="Page suivante" className="book-corner absolute inset-y-0 right-0 z-20 w-12 sm:w-16" onClick={() => go('next')} disabled={idx === pages.length - 1} />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button className="btn-ghost" onClick={() => go('prev')} disabled={idx === 0 || !!turn}>◀<span className="hidden sm:inline"> Précédente</span></button>
          <span className="text-sm text-parchemin-300/70">{idx + 1} / {pages.length}</span>
          <button className="btn-ghost" onClick={() => go('next')} disabled={idx === pages.length - 1 || !!turn}><span className="hidden sm:inline">Suivante </span>▶</button>
        </div>
      </div>
    </div>
  );
}

/** Une feuille de parchemin du grimoire. */
function Sheet({ page, index, total }: { page: Page; index: number; total: number }) {
  return (
    <div className="book-sheet relative h-full overflow-y-auto rounded-r-lg rounded-l-sm p-6 pl-9 text-nuit-900 sm:p-10 sm:pl-14">
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/30 via-black/10 to-transparent sm:w-12" />
      <PageContent page={page} />
      <div className="mt-6 text-center text-xs italic text-nuit-900/50">— Chroniques de Thiercelune, folio {index + 1} / {total} —</div>
    </div>
  );
}

function PageContent({ page }: { page: Page }) {
  if (page === 'intro') return (
    <div className="mx-auto max-w-2xl text-center">
      <h1 className="font-serif text-4xl text-nuit-900">Le Grimoire</h1>
      <p className="mt-2 italic text-nuit-900/70">Chroniques du village de Thiercelune</p>
      <div className="ornament bg-nuit-900/20" />
      <p className="mt-4 text-left">
        Ce livre contient les règles du jeu et la fiche de chaque âme qui hante le village.
        Tournez les pages pour découvrir les rôles, leurs pouvoirs et leurs conditions de victoire.
      </p>
      <h3 className="label mt-6 text-nuit-900/80">La nuit</h3>
      <p className="text-left">La première nuit est une nuit de préparation : seuls Cupidon, le Chien-Loup et l’Ange Déchu agissent. Dès la nuit 2, le Maître du jeu réveille les rôles dans l’ordre qu’il choisit.</p>
      <h3 className="label mt-4 text-nuit-900/80">Le jour</h3>
      <p className="text-left">Les villageois débattent à voix haute et votent depuis leur téléphone. Le vote est secret jusqu’à sa clôture. Le Chef compte deux voix.</p>
    </div>
  );
  if (page === 'sommaire') {
    const camps = ['village', 'loups', 'mercenaires', 'variable'] as const;
    return (
      <div>
        <h2 className="text-center font-serif text-3xl text-nuit-900">Sommaire des rôles</h2>
        <div className="ornament bg-nuit-900/20" />
        <div className="grid gap-4 sm:grid-cols-2">
          {camps.map((c) => (
            <div key={c}>
              <h3 className="label text-nuit-900/80">{CAMP_LABELS[c]}</h3>
              <ul className="space-y-0.5">
                {ROLE_ORDER.filter((id) => ROLES[id].camp === c).map((id) => (
                  <li key={id} className="flex items-center gap-2">
                    <span className="h-7 w-5 overflow-hidden rounded border border-nuit-900/20">
                      <RoleArt roleId={id} label={false} className="h-full w-full" />
                    </span>
                    <span>{ROLES[id].name}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const r = ROLES[page];
  return (
    <div className="grid gap-6 sm:grid-cols-[180px_1fr]">
      <div className="mx-auto w-40 overflow-hidden rounded-md shadow-lg sm:w-full">
        <RoleArt roleId={page} className="aspect-[2/3] w-full" />
      </div>
      <div className="space-y-3">
        <h2 className="font-serif text-3xl text-nuit-900">{r.name}</h2>
        <p className="italic text-nuit-900/70">« {r.tagline} »</p>
        <p>{r.description}</p>
        {r.powers.length > 0 && (
          <div>
            <h3 className="label text-nuit-900/80">Pouvoirs</h3>
            <ul className="space-y-0.5">{r.powers.map((p) => <li key={p}>✦ {p}</li>)}</ul>
          </div>
        )}
        <div>
          <h3 className="label text-nuit-900/80">Victoire</h3>
          <p>{r.victory}</p>
        </div>
        {r.rules.length > 0 && (
          <div>
            <h3 className="label text-nuit-900/80">Règles</h3>
            <ul className="space-y-0.5">{r.rules.map((p) => <li key={p}>❧ {p}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

// Compat avec les écrans existants qui importaient Modal/RoleSheetView ici.
export { Modal };
