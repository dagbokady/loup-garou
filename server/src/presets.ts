/**
 * Compositions de rôles enregistrées par chaque Maître du jeu (un fichier JSON par MJ).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROLES } from '../../shared/roles.ts';
import type { CompositionPreset, RoleId } from '../../shared/types.ts';
import { DATA_DIR, readJson, writeJsonAtomic } from './config.ts';

const MAX_PRESETS = 50;
const dir = path.join(DATA_DIR, 'presets');
fs.mkdirSync(dir, { recursive: true });
const fileFor = (gmId: string) => path.join(dir, `${gmId.replace(/[^a-zA-Z0-9-]/g, '')}.json`);

export class PresetError extends Error {}

export function listPresets(gmId: string): CompositionPreset[] {
  return readJson<CompositionPreset[]>(fileFor(gmId), []);
}

function clean(comp: unknown): Partial<Record<RoleId, number>> {
  const out: Partial<Record<RoleId, number>> = {};
  for (const [id, raw] of Object.entries((comp ?? {}) as Record<string, unknown>)) {
    const role = ROLES[id as RoleId];
    if (!role) continue;
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n <= 0) continue;
    out[id as RoleId] = role.multiple ? Math.min(n, 40) : 1;
  }
  return out;
}

/** Enregistre (ou remplace, à nom identique) une composition. */
export function savePreset(gmId: string, rawName: unknown, comp: unknown): CompositionPreset {
  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!name) throw new PresetError('Donnez un nom à la composition.');
  const composition = clean(comp);
  if (!Object.keys(composition).length) throw new PresetError('La composition est vide.');
  const list = listPresets(gmId);
  const existing = list.find((p) => p.name.toLowerCase() === name.toLowerCase());
  const preset: CompositionPreset = { id: existing?.id ?? crypto.randomUUID(), name, composition, updatedAt: Date.now() };
  const next = [preset, ...list.filter((p) => p.id !== preset.id)];
  if (next.length > MAX_PRESETS) throw new PresetError(`Maximum ${MAX_PRESETS} compositions.`);
  writeJsonAtomic(fileFor(gmId), next);
  return preset;
}

export function deletePreset(gmId: string, id: string): boolean {
  const list = listPresets(gmId);
  const next = list.filter((p) => p.id !== id);
  if (next.length === list.length) return false;
  writeJsonAtomic(fileFor(gmId), next);
  return true;
}
