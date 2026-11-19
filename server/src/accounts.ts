/**
 * Comptes du Maître du jeu.
 * - Mots de passe hachés avec scrypt + sel aléatoire (jamais stockés en clair).
 * - Jetons de session signés HMAC-SHA256 : ils survivent à un redémarrage du serveur.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, SESSION_SECRET, SESSION_TTL_MS, readJson, writeJsonAtomic } from './config.ts';

export interface GmAccount {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: number;
}

const FILE = path.join(DATA_DIR, 'accounts.json');
let accounts: GmAccount[] = readJson<GmAccount[]>(FILE, []);

const save = () => writeJsonAtomic(FILE, accounts);

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export class AuthError extends Error {}

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

export function register(username: string, password: string): GmAccount {
  username = String(username ?? '').trim();
  password = String(password ?? '');
  if (!USERNAME_RE.test(username)) throw new AuthError('Identifiant invalide (3 à 32 caractères : lettres, chiffres, _ . -).');
  if (password.length < 8 || password.length > 200) throw new AuthError('Le mot de passe doit contenir au moins 8 caractères.');
  if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase()))
    throw new AuthError('Cet identifiant est déjà utilisé.');
  const account: GmAccount = {
    id: crypto.randomUUID(),
    username,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };
  accounts.push(account);
  save();
  return account;
}

// Limitation simple des tentatives de connexion (en mémoire).
const failures = new Map<string, { count: number; first: number }>();
const WINDOW = 15 * 60 * 1000;
const MAX_FAILURES = 10;

export function login(username: string, password: string, ip: string): GmAccount {
  const key = `${ip}|${String(username).toLowerCase()}`;
  const f = failures.get(key);
  if (f && Date.now() - f.first < WINDOW && f.count >= MAX_FAILURES)
    throw new AuthError('Trop de tentatives. Réessayez dans quelques minutes.');
  const account = accounts.find((a) => a.username.toLowerCase() === String(username ?? '').trim().toLowerCase());
  if (!account || !verifyPassword(String(password ?? ''), account.passwordHash)) {
    const cur = f && Date.now() - f.first < WINDOW ? f : { count: 0, first: Date.now() };
    cur.count++;
    failures.set(key, cur);
    throw new AuthError('Identifiant ou mot de passe incorrect.');
  }
  failures.delete(key);
  return account;
}

export function issueToken(account: GmAccount): string {
  const payload = Buffer.from(JSON.stringify({ sub: account.id, exp: Date.now() + SESSION_TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: unknown): GmAccount | null {
  if (typeof token !== 'string') return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof exp !== 'number' || exp < Date.now()) return null;
    return accounts.find((a) => a.id === sub) ?? null;
  } catch {
    return null;
  }
}
