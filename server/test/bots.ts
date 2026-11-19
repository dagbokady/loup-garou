/**
 * Simulation : des joueurs automatiques rejoignent une partie et jouent seuls.
 * Usage : npm run bots [-- CODE] [nombre] [url]
 *   Sans code, rejoint la partie la plus récente en salle d'attente.
 * Variables : BOT_SPEED (1 = normal, 3 = trois fois plus vite).
 *
 * Les bots jouent « honnêtement » avec ce que leur téléphone leur montre :
 * la Voyante accuse les loups qu'elle a vus, les loups protègent la meute,
 * les amoureux s'épargnent, le Chasseur tire, le Chef désigne un successeur.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';
import type { Ack, PlayerView, RoleId } from '../../shared/types.ts';

const ARGS = process.argv.slice(2);
const URL = ARGS.find((a) => /^https?:/.test(a)) ?? 'http://localhost:3001';
const COUNT = Number(ARGS.find((a) => /^\d+$/.test(a)) ?? 6) || 6;
const GAMES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data/active-games.json');
type SavedGame = { code: string; status: string; createdAt?: number; players: { name: string; token: string }[] };
const savedGames = (): SavedGame[] => { try { return JSON.parse(fs.readFileSync(GAMES_FILE, 'utf8')); } catch { return []; } };
/** Sans code : la partie la plus récente en salle d'attente, demandée au serveur. */
const lobbies = await fetch(`${URL}/api/dev/lobbies`).then((r) => r.json() as Promise<{ code: string; gm: string }[]>).catch(() => []);
// Les MJ automatiques des tests (botmj…) sont ignorés : on vise la partie d'un vrai MJ.
const humanLobby = lobbies.find((l) => !/^botmj/i.test(l.gm ?? ''));
const CODE = (ARGS.find((a) => !/^https?:/.test(a) && !/^\d+$/.test(a)) ?? humanLobby?.code ?? '').toUpperCase();
const ALL_NAMES = ['Amara', 'Koffi', 'Awa', 'Yao', 'Fatou', 'Ibrahim', 'Léa', 'Moussa', 'Nina', 'Oscar', 'Rose', 'Sami', 'Tano', 'Zoé', 'Kwame', 'Mariam'];
const NAMES = ALL_NAMES.slice(0, Math.max(1, Math.min(ALL_NAMES.length, COUNT)));
if (!CODE) { console.error('Aucune partie en salle d’attente : créez-en une depuis l’écran MJ, ou passez un code.'); process.exit(1); }
console.log(`Partie ${CODE} — ${NAMES.length} bots sur ${URL}`);

/** Jeton d'un bot déjà assis à la table (instantané local du serveur de développement). */
function savedToken(name: string): string | null {
  try {
    return savedGames().find((g) => g.code === CODE)?.players.find((p) => p.name === name)?.token ?? null;
  } catch { return null; }
}

type Cand = { id: string; name: string };
const SPEED = Math.max(0.1, Number(process.env.BOT_SPEED ?? 1) || 1);
const pick = <T,>(a: T[]): T | undefined => a[Math.floor(Math.random() * a.length)];
const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);
/** Temps de réflexion humain, accéléré par BOT_SPEED. */
const think = (min: number, spread: number) => new Promise((r) => setTimeout(r, (min + Math.random() * spread) / SPEED));
const PACK_ROLES: RoleId[] = ['loup', 'loupNoir', 'loupBavard', 'loupBlanc'];
const WOLF_LINES = ['On y va ?', 'Je propose celui-là.', 'Attention à la Voyante…', 'D’accord avec vous.', 'Évitons le Chef, trop visible.'];
/** Proie commune à la meute, partagée entre bots d'un même processus. */
const sharedWolfTarget: Record<string, Cand | undefined> = {};
/** Accusations publiques (la Voyante « parle » au village) : nom → poids. */
const accusations = new Map<string, number>();

function bot(name: string) {
  const s: Socket = io(URL, { transports: ['websocket'] });
  const done = new Set<string>();
  let role: RoleId | null = null;
  let token = '';
  const log = (m: string) => console.log(`[${new Date().toLocaleTimeString()}] ${name.padEnd(8)} ${m}`);
  const send = (ev: string, payload: unknown, what: string) =>
    s.emit(ev, payload, (r: Ack<unknown>) => log(r?.ok ? what : `❌ ${what} : ${r?.error}`));
  /** Exécute une fois par clé (les états arrivent souvent en rafale). */
  const once = (k: string) => (done.has(k) ? false : (done.add(k), true));

  const hello = (t: string) => s.emit('player:hello', { token: t }, (r: Ack<unknown>) => {
    if (r?.ok) { token = t; log('reprend sa place'); } else log(`❌ reprise refusée : ${r?.error}`);
  });
  s.on('connect', () => {
    // Reconnexion (veille, coupure réseau, redémarrage du serveur) : on reprend la place avec le jeton.
    if (token) return hello(token);
    s.emit('player:join', { code: CODE, name }, (r: Ack<{ token: string }>) => {
      if (r?.ok) { token = r.data?.token ?? ''; return log('a rejoint la partie'); }
      // Nom déjà pris : bot d'une session précédente, on retrouve son jeton dans l'instantané local.
      const saved = savedToken(name);
      if (saved) return hello(saved);
      log(`❌ ${r?.error ?? 'refusé'}`);
    });
  });

  s.on('player:state', async (v: PlayerView) => {
    const me = v.me;
    if (me.roleId && me.roleId !== role) { role = me.roleId; log(`reçoit sa carte : ${role}`); }
    if (v.game.status === 'ended') { if (once('end')) log(`fin — ${me.isWinner ? 'gagné 🎉' : 'perdu'}`); return; }
    if (v.game.status !== 'running') return;

    const isPack = !!role && (PACK_ROLES.includes(role) || v.wolfChat !== null);
    const packNames = new Set(v.wolfChat?.pack ?? []);
    const loverId = me.lover?.id;
    const seenWolves = new Set(me.visions.filter((x) => x.roleId && PACK_ROLES.includes(x.roleId)).map((x) => x.targetId));
    const seenGood = new Set(me.visions.filter((x) => x.roleId && !PACK_ROLES.includes(x.roleId)).map((x) => x.targetId));

    /** Cible la plus « logique » pour ce bot parmi des candidats (vote, tir, poison). */
    const choose = (cands: Cand[], hostile = true): Cand | undefined => {
      let pool = cands.filter((c) => c.id !== me.id && c.id !== loverId);
      if (!pool.length) pool = cands.filter((c) => c.id !== me.id);
      if (isPack) {
        const nonPack = pool.filter((c) => !packNames.has(c.name));
        if (nonPack.length) pool = nonPack;
        // Les loups visent en priorité ceux que la Voyante a accusés… pour la faire taire.
        return pool.find((c) => accusations.has(c.name) && Math.random() < 0.3) ?? pick(pool);
      }
      if (hostile) {
        const known = pool.find((c) => seenWolves.has(c.id));
        if (known) return known;
        const clean = pool.filter((c) => !seenGood.has(c.id));
        if (clean.length) pool = clean;
        // Suit parfois les accusations publiques.
        const accused = [...pool].sort((a, b) => (accusations.get(b.name) ?? 0) - (accusations.get(a.name) ?? 0))[0];
        if (accused && (accusations.get(accused.name) ?? 0) > 0 && Math.random() < 0.6) return accused;
      }
      return pick(pool);
    };

    // Révélation : le bot « regarde » sa carte.
    if (v.game.revealing && once('sawCard')) { await think(800, 1500); s.emit('player:sawCard', {}, () => {}); }

    // Chasseur : tire même mort (sinon la partie reste bloquée).
    if (v.hunter && once(`hunter:${v.hunter.triggerId}`)) {
      await think(2000, 2000);
      const t = choose(v.hunter.candidates);
      if (t) send('player:hunterShot', { targetId: t.id }, `🏹 tire sur ${t.name}`);
    }
    // Chef mort : désigne un successeur de confiance.
    if (v.succession && once(`succ:${v.succession.triggerId}`)) {
      await think(2000, 2000);
      const t = choose(v.succession.candidates, false);
      if (t) send('player:chiefSuccessor', { targetId: t.id }, `👑 désigne ${t.name}`);
    }
    if (!me.alive) return;

    // Voyante : rend publiques (pour les autres bots) les loups qu'elle a vus.
    for (const x of me.visions) if (x.roleId && PACK_ROLES.includes(x.roleId) && once(`accuse:${x.targetId}`)) {
      accusations.set(x.name, (accusations.get(x.name) ?? 0) + 3);
      log(`🔮 accuse ${x.name} au réveil`);
    }

    // Action de nuit
    const a = v.action;
    if (a && !a.recorded && v.game.phase === 'night') {
      const k = `${v.game.nightNumber}:${a.key}`;
      if (a.kind === 'pack') {
        if (!once(`${k}:${a.chosen ?? ''}`) || a.chosen) return;
        await think(1200, 2000);
        // Se rallie à la proie déjà suggérée par un autre loup, sinon en propose une.
        const already = a.suggestions?.sort((x, y) => y.by.length - x.by.length)[0];
        const t = already ? a.candidates.find((c) => c.id === already.targetId) : (sharedWolfTarget[k] ??= choose(a.candidates));
        if (t && a.mine !== t.id) send('player:wolfSuggest', { targetId: t.id }, `🐺 suggère ${t.name}`);
        if (v.wolfChat?.open && Math.random() < 0.5) s.emit('player:wolfChat', { text: pick(WOLF_LINES) }, () => {});
        return;
      }
      if (!once(k)) return;
      await think(1500, 2500);
      const others = a.candidates.filter((c) => c.id !== me.id);
      let action: Record<string, unknown> = {};
      if (a.kind === 'target') {
        let t: Cand | undefined;
        if (a.key === 'voyante' || a.key === 'renard') t = pick(others.filter((c) => !me.visions.some((x) => x.targetId === c.id))) ?? pick(others);
        else if (a.key === 'salvateur') t = (Math.random() < 0.3 ? a.candidates.find((c) => c.id === me.id) : undefined) ?? (loverId ? a.candidates.find((c) => c.id === loverId) : undefined) ?? pick(a.candidates);
        else if (a.key === 'corbeau') t = choose(others);
        else t = isPack ? choose(others) : pick(others);
        action = { targets: t ? [t.id] : [] };
      } else if (a.kind === 'targets') {
        const n = Math.min(a.max ?? 2, a.candidates.length);
        action = { targets: shuffle(a.candidates).slice(0, n).map((c) => c.id) };
      } else if (a.kind === 'choice') {
        action = { choice: pick(a.options ?? [])?.value };
      } else if (a.kind === 'bavard') {
        // Le Loup Bavard garde souvent son pouvoir, puis vise un villageois (voire redirige vers un innocent).
        const voter = pick(others.filter((c) => !packNames.has(c.name))) ?? pick(others);
        const dest = choose(others.filter((c) => c.id !== voter?.id));
        const r = Math.random();
        action = !voter || r < 0.5 ? { choice: 'passer', targets: [] }
          : dest && r < 0.75 ? { choice: 'rediriger', targets: [voter.id, dest.id] }
          : { choice: 'annuler', targets: [voter.id] };
      } else if (a.kind === 'witch') {
        const victim = a.victims?.[0];
        // Sauve toujours son amoureux ou elle-même, souvent les autres ; empoisonne un suspect.
        const heal = victim && (victim.id === me.id || victim.id === loverId || Math.random() < 0.6) ? victim.id : null;
        const suspect = others.find((c) => seenWolves.has(c.id) || (accusations.get(c.name) ?? 0) > 0);
        const poison = suspect && Math.random() < 0.7 ? suspect.id : Math.random() < 0.15 ? choose(others)?.id ?? null : null;
        action = { heal, poison };
      }
      send('player:action', { key: a.key, action }, `action ${a.key} → ${JSON.stringify(action)}`);
    }

    // Vote du village (ou élection du Chef)
    const vote = v.vote;
    if (vote && vote.status === 'open' && vote.canVote && !vote.myBallot && once(`vote:${vote.id}`)) {
      await think(2000, 4000);
      const t = vote.kind === 'chef' ? (isPack ? choose(vote.candidates, false) : pick(vote.candidates.filter((c) => !seenWolves.has(c.id)))) : choose(vote.candidates);
      send('player:ballot', { targetId: t?.id ?? null }, `🗳 vote pour ${t?.name ?? 'personne'}`);
    }
  });

  s.on('player:kicked', () => log('expulsé'));
  s.on('player:replaced', () => log('session ouverte ailleurs'));
  s.on('disconnect', () => log('déconnecté'));
}

NAMES.forEach((n, i) => setTimeout(() => bot(n), i * 400));
