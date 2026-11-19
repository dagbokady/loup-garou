/**
 * Configuration du serveur (variables d'environnement + dossiers de données).
 * Aucune base de données : les comptes MJ et les archives sont de simples fichiers JSON,
 * les parties actives vivent en mémoire (avec un instantané optionnel sur disque).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(here, '..', '..');
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? path.join(ROOT_DIR, 'server', 'data'));
export const CLIENT_DIST = path.join(ROOT_DIR, 'client', 'dist');
export const PORT = Number(process.env.PORT ?? 3001);
export const IS_PROD = process.env.NODE_ENV === 'production';
/** Code d'invitation optionnel pour restreindre la création de comptes MJ. */
export const GM_INVITE_CODE = process.env.GM_INVITE_CODE ?? '';
/** Instantané des parties actives sur disque (désactivable avec PERSIST_ACTIVE=0). */
export const PERSIST_ACTIVE = process.env.PERSIST_ACTIVE !== '0';
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

fs.mkdirSync(path.join(DATA_DIR, 'archives'), { recursive: true });

function loadSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(DATA_DIR, 'secret.key');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

export const SESSION_SECRET = loadSecret();

/** Écriture atomique d'un fichier JSON. */
export function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}
