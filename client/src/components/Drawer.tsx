import { useEffect, type ReactNode } from 'react';

/** Panneau latéral (Livre des événements, Registre…) : garde l'écran principal léger. */
export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-nuit-950/60 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} onClick={onClose} />
      <aside
        role="dialog"
        aria-label={title}
        className={`absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-or-500/40 bg-nuit-950/95 shadow-2xl backdrop-blur transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-or-500/20 px-4 py-3">
          <h2 className="font-title text-lg text-gold">{title}</h2>
          <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Fermer">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{open && children}</div>
      </aside>
    </div>
  );
}
