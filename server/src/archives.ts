/**
 * Historique des parties terminées, stocké dans un fichier JSON par Maître du jeu.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import type { ArchiveSummary, ArchivedGame } from '../../shared/types.ts';
import { DATA_DIR, readJson, writeJsonAtomic } from './config.ts';

const MAX_ARCHIVES = 200;
const fileFor = (gmId: string) => path.join(DATA_DIR, 'archives', `${gmId.replace(/[^a-zA-Z0-9-]/g, '')}.json`);

export function listArchives(gmId: string): ArchivedGame[] {
  return readJson<ArchivedGame[]>(fileFor(gmId), []);
}

export function summaries(gmId: string): ArchiveSummary[] {
  return listArchives(gmId)
    .map((a) => ({
      id: a.id,
      code: a.code,
      createdAt: a.createdAt,
      endedAt: a.endedAt,
      status: a.status,
      winner: a.winner,
      playerCount: a.players.length,
      imported: a.imported,
    }))
    .sort((a, b) => b.endedAt - a.endedAt);
}

export function getArchive(gmId: string, id: string): ArchivedGame | null {
  return listArchives(gmId).find((a) => a.id === id) ?? null;
}

export function saveArchive(gmId: string, archive: ArchivedGame) {
  const list = listArchives(gmId).filter((a) => a.id !== archive.id);
  list.push(archive);
  list.sort((a, b) => b.endedAt - a.endedAt);
  writeJsonAtomic(fileFor(gmId), list.slice(0, MAX_ARCHIVES));
}

export function deleteArchive(gmId: string, id: string): boolean {
  const list = listArchives(gmId);
  const next = list.filter((a) => a.id !== id);
  if (next.length === list.length) return false;
  writeJsonAtomic(fileFor(gmId), next);
  return true;
}

/** Validation minimale d'un fichier JSON importé. */
export function importArchive(gmId: string, raw: unknown): ArchivedGame {
  const src = (raw && typeof raw === 'object' && 'game' in (raw as object) ? (raw as { game: unknown }).game : raw) as Record<string, unknown>;
  if (!src || typeof src !== 'object') throw new Error('Fichier invalide.');
  if (!Array.isArray(src.players)) throw new Error('Le fichier ne contient pas de liste de joueurs.');
  const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const archive: ArchivedGame = {
    id: crypto.randomUUID(),
    code: str(src.code, 12) || '??????',
    gmName: str(src.gmName, 64),
    createdAt: num(src.createdAt, Date.now()),
    endedAt: num(src.endedAt, Date.now()),
    status: src.status === 'cancelled' ? 'cancelled' : 'ended',
    winner: typeof src.winner === 'string' ? str(src.winner, 120) : null,
    composition: (src.composition as ArchivedGame['composition']) ?? {},
    settings: (src.settings as ArchivedGame['settings']) ?? { expectedPlayers: src.players.length, piperCharmCount: 2 },
    players: (src.players as Record<string, unknown>[]).slice(0, 60).map((p, i) => ({
      id: typeof p?.id === 'string' ? p.id.slice(0, 64) : undefined,
      name: str(p?.name, 40) || `Joueur ${i + 1}`,
      seat: num(p?.seat, i),
      roleId: (typeof p?.roleId === 'string' ? p.roleId : null) as ArchivedGame['players'][number]['roleId'],
      originalRoleId: (typeof p?.originalRoleId === 'string' ? p.originalRoleId : null) as ArchivedGame['players'][number]['roleId'],
      alive: p?.alive !== false,
      deathReason: str(p?.deathReason) || undefined,
      deathRound: str(p?.deathRound) || undefined,
    })),
    events: Array.isArray(src.events) ? (src.events as ArchivedGame['events']).slice(0, 5000) : [],
    votes: Array.isArray(src.votes) ? (src.votes as ArchivedGame['votes']).slice(0, 500) : [],
    imported: true,
  };
  saveArchive(gmId, archive);
  return archive;
}
