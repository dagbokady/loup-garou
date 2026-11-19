import { useEffect, useState } from 'react';

/**
 * Voile de transition plein écran : la scène sombrit, un texte s'affiche,
 * puis la nouvelle scène se révèle. Utilisé pour les passages jour <-> nuit.
 */
export function useVeil(key: string, text: string, enabled = true) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setVisible(true); setLeaving(false);
    const t1 = setTimeout(() => setLeaving(true), 2000);
    const t2 = setTimeout(() => setVisible(false), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!visible) return null;
  return (
    <div className={`veil ${leaving ? 'veil-out' : ''}`} aria-hidden>
      <div className="veil-bg" />
      <div className="veil-text">{text}</div>
    </div>
  );
}
