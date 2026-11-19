import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ROLES } from '@shared/roles';
import type { ArchiveSummary, ArchivedGame } from '@shared/types';
import { Background } from '../../components/Background';
import { Confirm, Modal } from '../../components/Modal';
import { RoleThumb } from '../../components/RoleArt';
import { api, downloadJson, fmtDate, fmtTime } from '../../lib/api';
import { storage } from '../../lib/storage';
import { useToast } from '../../lib/toast';

/** Historique des parties du Maître du jeu + export / import JSON. */
export function GmArchives() {
  const nav = useNavigate();
  const toast = useToast();
  const [list, setList] = useState<ArchiveSummary[] | null>(null);
  const [open, setOpen] = useState<ArchivedGame | null>(null);
  const [toDelete, setToDelete] = useState<ArchiveSummary | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api<ArchiveSummary[]>('/api/archives')
      .then(setList)
      .catch((e) => {
        toast(e.message, 'error');
        if (/session/i.test(e.message)) { storage.setGm(null); nav('/mj'); }
      });

  useEffect(() => {
    if (!storage.getGm()) nav('/mj', { replace: true });
    else load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const show = async (id: string) => {
    try { setOpen(await api<ArchivedGame>(`/api/archives/${id}`)); } catch (e) { toast((e as Error).message, 'error'); }
  };
  const exportOne = async (s: ArchiveSummary) => {
    try {
      const data = await api<ArchivedGame>(`/api/archives/${s.id}`);
      downloadJson(`loup-garou-${s.code}-${new Date(s.endedAt).toISOString().slice(0, 10)}.json`, { format: 'loup-garou/1', exportedAt: Date.now(), game: data });
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const importFile = async (file: File) => {
    try {
      if (file.size > 3_000_000) throw new Error('Fichier trop volumineux.');
      const json = JSON.parse(await file.text());
      await api('/api/archives/import', { method: 'POST', json });
      toast('Partie importée dans vos archives.', 'success');
      load();
    } catch (e) {
      toast(e instanceof SyntaxError ? 'Ce fichier n’est pas un JSON valide.' : (e as Error).message, 'error');
    }
  };

  return (
    <div className="min-h-screen px-3 py-6 sm:px-6">
      <Background mode="night" />
      <div className="mx-auto max-w-4xl animate-rise">
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/mj/table" className="btn-ghost btn-sm">← Retour à la table</Link>
          <h1 className="flex-1 font-display text-3xl text-gold">Les Archives</h1>
          <button className="btn-violet btn-sm" onClick={() => fileRef.current?.click()}>⇧ Importer un JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
        <div className="panel mt-4 p-4">
          {list === null ? (
            <p className="text-center text-parchemin-300">Chargement…</p>
          ) : list.length === 0 ? (
            <p className="py-10 text-center italic text-parchemin-300/70">Aucune partie archivée pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-or-500/20">
              {list.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-title text-or-100">
                      Partie {s.code} {s.imported && <span className="chip ml-1 border-mystic-400/50 text-mystic-400">importée</span>}
                    </div>
                    <div className="text-sm text-parchemin-300/80">
                      {fmtDate(s.createdAt)} · {s.playerCount} joueurs · {s.status === 'cancelled' ? 'Annulée' : `Victoire : ${s.winner ?? '—'}`}
                    </div>
                  </div>
                  <button className="btn-ghost btn-sm" onClick={() => show(s.id)}>Consulter</button>
                  <button className="btn-ghost btn-sm" onClick={() => exportOne(s)}>⇩ JSON</button>
                  <button className="btn-ghost btn-sm text-red-300" onClick={() => setToDelete(s)} aria-label="Supprimer">✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="mt-3 text-center text-sm text-parchemin-300/60">Les archives sont conservées dans un fichier JSON sur le serveur. Exportez-les pour les garder ailleurs.</p>
      </div>

      {open && <ArchiveDetail game={open} onClose={() => setOpen(null)} />}
      <Confirm
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Supprimer cette archive ?"
        message={`La partie ${toDelete?.code} sera définitivement supprimée du serveur. Pensez à l’exporter avant si vous souhaitez la garder.`}
        confirmLabel="Supprimer définitivement"
        danger
        onConfirm={async () => {
          try { await api(`/api/archives/${toDelete!.id}`, { method: 'DELETE' }); load(); } catch (e) { toast((e as Error).message, 'error'); }
        }}
      />
    </div>
  );
}

function ArchiveDetail({ game, onClose }: { game: ArchivedGame; onClose: () => void }) {
  const deaths = game.events.filter((e) => e.type === 'death');
  return (
    <Modal open onClose={onClose} title={`Partie ${game.code}`} wide>
      <p className="text-parchemin-200">
        {fmtDate(game.createdAt)} → {fmtDate(game.endedAt)} · {game.status === 'cancelled' ? 'Annulée' : <>Victoire : <strong className="text-or-200">{game.winner}</strong></>}
      </p>
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <div>
          <h3 className="label">Joueurs et rôles</h3>
          <ul className="space-y-1.5">
            {[...game.players].sort((a, b) => a.seat - b.seat).map((p) => (
              <li key={p.name} className="flex items-center gap-2">
                {p.roleId && ROLES[p.roleId] && <RoleThumb roleId={p.roleId} size={22} />}
                <span className={p.alive ? '' : 'text-parchemin-300 line-through'}>{p.name}</span>
                <span className="text-sm text-or-200/70">
                  {p.roleId && ROLES[p.roleId] ? ROLES[p.roleId].name : '—'}
                  {p.originalRoleId && p.originalRoleId !== p.roleId && ROLES[p.originalRoleId] ? ` (ex-${ROLES[p.originalRoleId].name})` : ''}
                </span>
                {!p.alive && <span className="ml-auto text-xs text-parchemin-300/60">{p.deathRound}</span>}
              </li>
            ))}
          </ul>
          <h3 className="label mt-4">Éliminations</h3>
          <ul className="space-y-1 text-sm">
            {deaths.map((e) => <li key={e.id}>✝ {e.text}</li>)}
            {!deaths.length && <li className="italic text-parchemin-300/60">Aucune.</li>}
          </ul>
          <h3 className="label mt-4">Votes</h3>
          <ul className="space-y-1 text-sm">
            {game.votes.map((v) => (
              <li key={v.id}><strong>{v.label}</strong> — {v.result?.entries.map((e) => `${playerName(game, e.playerId)} : ${e.total}`).join(', ') || 'aucune voix'}</li>
            ))}
            {!game.votes.length && <li className="italic text-parchemin-300/60">Aucun.</li>}
          </ul>
        </div>
        <div>
          <h3 className="label">Livre des événements</h3>
          <ol className="max-h-[55vh] space-y-1 overflow-y-auto rounded-lg bg-nuit-950/50 p-2 text-sm">
            {game.events.map((e) => (
              <li key={e.id}><span className="text-parchemin-300/50">{fmtTime(e.at)}</span> {e.visibility === 'gm' ? '🔒' : ''} {e.text}</li>
            ))}
          </ol>
        </div>
      </div>
    </Modal>
  );
}

function playerName(game: ArchivedGame, id: string) {
  return game.players.find((p) => p.id === id)?.name ?? '?';
}
