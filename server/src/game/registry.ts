/**
 * Registre des parties actives (en mémoire).
 * Un instantané est écrit sur disque (data/active-games.json) pour survivre à un
 * redémarrage du serveur ; désactivable avec PERSIST_ACTIVE=0.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import { DATA_DIR, PERSIST_ACTIVE, readJson, writeJsonAtomic } from '../config.ts';
import { createGame, type Game } from './engine.ts';

const games = new Map<string, Game>();
const SNAPSHOT = path.join(DATA_DIR, 'active-games.json');
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans 0/O/1/I

function newCode(): string {
  for (;;) {
    let code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (![...games.values()].some((g) => g.code === code)) return code;
  }
}

export const registry = {
  /** Partie active (lobby ou en cours) d'un Maître du jeu. */
  activeForGm(gmId: string): Game | null {
    for (const g of games.values()) if (g.gmId === gmId && (g.status === 'lobby' || g.status === 'running')) return g;
    return null;
  },
  /** Dernière partie (y compris terminée) encore en mémoire pour ce MJ. */
  latestForGm(gmId: string): Game | null {
    return [...games.values()].filter((g) => g.gmId === gmId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  },
  create(gmId: string, gmName: string, expectedPlayers: number): Game {
    if (this.activeForGm(gmId)) throw new Error('Vous avez déjà une partie active. Terminez-la ou annulez-la d’abord.');
    // Une seule partie conservée par MJ : les anciennes (terminées) sont déjà archivées.
    for (const [id, g] of games) if (g.gmId === gmId) games.delete(id);
    const game = createGame(gmId, gmName, newCode(), expectedPlayers);
    games.set(game.id, game);
    this.save();
    return game;
  },
  /** Relance la dernière partie terminée de ce MJ avec les mêmes joueurs. */
  rematch(gmId: string, apply: (g: Game) => void): Game {
    if (this.activeForGm(gmId)) throw new Error('Vous avez déjà une partie active.');
    const g = this.latestForGm(gmId);
    if (!g) throw new Error('Aucune partie précédente à relancer.');
    games.delete(g.id);
    try { apply(g); } finally { games.set(g.id, g); }
    this.save();
    return g;
  },
  byCode(code: string): Game | null {
    const c = String(code ?? '').trim().toUpperCase();
    for (const g of games.values()) if (g.code === c) return g;
    return null;
  },
  byPlayerToken(token: string): { game: Game; playerId: string } | null {
    if (typeof token !== 'string' || token.length < 20) return null;
    for (const g of games.values()) {
      const p = g.players.find((x) => x.token.length === token.length && crypto.timingSafeEqual(Buffer.from(x.token), Buffer.from(token)));
      if (p) return { game: g, playerId: p.id };
    }
    return null;
  },
  byId(id: string): Game | null {
    return games.get(id) ?? null;
  },
  remove(id: string) {
    games.delete(id);
    this.save();
  },
  all(): Game[] {
    return [...games.values()];
  },
  saveTimer: null as NodeJS.Timeout | null,
  save() {
    if (!PERSIST_ACTIVE) return;
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      try {
        writeJsonAtomic(SNAPSHOT, [...games.values()]);
      } catch (e) {
        console.error('Instantané impossible :', e);
      }
    }, 800);
  },
  /** Écriture immédiate (arrêt du serveur). */
  flush() {
    if (!PERSIST_ACTIVE) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    try { writeJsonAtomic(SNAPSHOT, [...games.values()]); } catch (e) { console.error('Instantané impossible :', e); }
  },
  load() {
    if (!PERSIST_ACTIVE) return;
    const list = readJson<Game[]>(SNAPSHOT, []);
    // On ne recharge que les parties récentes (moins de 48 h).
    const limit = Date.now() - 48 * 3600 * 1000;
    for (const g of list) {
      if (g.createdAt < limit) continue;
      g.players.forEach((p) => (p.connected = false));
      games.set(g.id, g);
    }
    if (games.size) console.log(`↺ ${games.size} partie(s) restaurée(s) depuis l’instantané.`);
  },
};
