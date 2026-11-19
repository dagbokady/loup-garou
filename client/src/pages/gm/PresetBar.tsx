import { useEffect, useState } from 'react';
import { compositionTotal } from '@shared/roles';
import type { CompositionPreset, RoleId } from '@shared/types';
import { api } from '../../lib/api';
import { useToast } from '../../lib/toast';

type Comp = Partial<Record<RoleId, number>>;

/** Modèles fournis d'office, en plus des compositions enregistrées par le MJ. */
const BUILT_IN: { name: string; composition: Comp }[] = [
  { name: '8 joueurs classique', composition: { loup: 2, voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1, villageois: 2 } },
  { name: '10 joueurs classique', composition: { loup: 2, voyante: 1, sorciere: 1, chasseur: 1, cupidon: 1, petiteFille: 1, salvateur: 1, villageois: 2 } },
  { name: 'Chaos (12)', composition: { loup: 1, loupNoir: 1, loupBavard: 1, loupBlanc: 1, voyante: 1, sorciere: 1, renard: 1, corbeau: 1, joueurDeFlute: 1, angeDechu: 1, chienLoup: 1, filleDeJoie: 1 } },
];

/** Compositions prêtes à l'emploi : appliquer en un clic, enregistrer la composition en cours. */
export function PresetBar({ current, apply }: { current: Comp; apply: (c: Comp) => void }) {
  const toast = useToast();
  const [mine, setMine] = useState<CompositionPreset[]>([]);
  const [name, setName] = useState('');
  useEffect(() => { api<CompositionPreset[]>('/api/presets').then(setMine).catch(() => {}); }, []);

  const save = async () => {
    try {
      const p = await api<CompositionPreset>('/api/presets', { method: 'POST', json: { name, composition: current } });
      setMine((l) => [p, ...l.filter((x) => x.id !== p.id)]);
      setName('');
      toast(`Composition « ${p.name} » enregistrée.`);
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const remove = async (p: CompositionPreset) => {
    try { await api(`/api/presets/${p.id}`, { method: 'DELETE' }); setMine((l) => l.filter((x) => x.id !== p.id)); }
    catch (e) { toast((e as Error).message, 'error'); }
  };

  const chip = 'rounded-full bg-white/5 px-3 py-1 text-xs ring-1 ring-or-500/25 hover:ring-or-400';
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-white/[.03] p-3 ring-1 ring-or-500/15">
      <p className="text-xs uppercase tracking-[0.25em] text-parchemin-300">Compositions prêtes</p>
      <div className="flex flex-wrap gap-1.5">
        {BUILT_IN.map((p) => <button key={p.name} className={chip} onClick={() => apply(p.composition)}>{p.name}</button>)}
        {mine.map((p) => (
          <span key={p.id} className="inline-flex items-center overflow-hidden rounded-full bg-violet-500/10 text-xs ring-1 ring-violet-400/40">
            <button className="px-3 py-1 hover:bg-violet-500/20" onClick={() => apply(p.composition)}>{p.name} · {compositionTotal(p.composition)}</button>
            <button className="px-2 py-1 text-parchemin-300 hover:bg-sang-500/30" aria-label={`Supprimer ${p.name}`} onClick={() => remove(p)}>×</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="input !py-1.5 !text-sm" placeholder="Nom (ex. Soirée du vendredi)" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <button className="btn-ghost btn-sm shrink-0 ring-1 ring-or-500/30" disabled={!name.trim() || !compositionTotal(current)} onClick={save}>Enregistrer</button>
      </div>
    </div>
  );
}
