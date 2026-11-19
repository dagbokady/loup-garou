/**
 * Moteur de partie.
 *
 * Principe fondamental : l'application n'automatise jamais une décision de jeu.
 * Elle enregistre les choix, vérifie les règles (pouvoirs déjà utilisés, cibles valides…),
 * PROPOSE des conséquences, et c'est le Maître du jeu qui valide ce qui s'applique.
 *
 * Toutes les fonctions lèvent une GameError avec un message lisible si l'action est refusée.
 */
import crypto from 'node:crypto';
import { NIGHT_ACTIONS, PACK_ROLES, ROLES, compositionTotal } from '../../../shared/roles.ts';
import type {
  ArchivedGame,
  BavardEffect,
  ChatMessage,
  Consequence,
  GameEvent,
  GameSettings,
  GameStatus,
  NightActionKey,
  NightActionRecord,
  NightState,
  PendingTrigger,
  Phase,
  PlayerState,
  PowerState,
  RoleId,
  VoteKind,
  VoteRecord,
  VictoryCheck,
  VoteResult,
  WinnerCamp,
} from '../../../shared/types.ts';

export class GameError extends Error {}

export interface PlayerInternal extends PlayerState {
  /** Jeton de reconnexion secret (jamais transmis aux autres joueurs). */
  token: string;
}

export interface Game {
  id: string;
  code: string;
  gmId: string;
  gmName: string;
  createdAt: number;
  endedAt?: number;
  /** Dernier joueur désigné par un vote du village (pour la révélation sur les téléphones). */
  lastVerdict?: { id: string; playerId: string; day: number; loverId?: string };
  status: GameStatus;
  phase: Phase;
  dayNumber: number;
  nightNumber: number;
  settings: GameSettings;
  composition: Partial<Record<RoleId, number>>;
  players: PlayerInternal[];
  chiefId: string | null;
  powers: PowerState;
  night: NightState | null;
  vote: VoteRecord | null;
  votes: VoteRecord[];
  events: GameEvent[];
  wolfChat: ChatMessage[];
  pendingTriggers: PendingTrigger[];
  winner: string | null;
  winnerIds: string[];
  rolesDistributed: boolean;
  firstEliminationVoteId?: string;
  /** Minuteur de débat (jour) */
  debate?: { endsAt: number; seconds: number } | null;
  /** Période de révélation avant la première nuit */
  revealing?: boolean;
  sawCard?: string[];
}

export const MAX_PLAYERS = 40;
export const MIN_PLAYERS = 3;
const uid = () => crypto.randomUUID();
export const newToken = () => crypto.randomBytes(32).toString('base64url');

/* ------------------------------------------------------------------ */
/* Utilitaires                                                         */
/* ------------------------------------------------------------------ */

export function createGame(gmId: string, gmName: string, code: string, expectedPlayers: number): Game {
  const game: Game = {
    id: uid(),
    code,
    gmId,
    gmName,
    createdAt: Date.now(),
    status: 'lobby',
    phase: 'lobby',
    dayNumber: 0,
    nightNumber: 0,
    settings: { expectedPlayers: clampInt(expectedPlayers, MIN_PLAYERS, MAX_PLAYERS, 8), piperCharmCount: 2 },
    composition: {},
    players: [],
    chiefId: null,
    powers: {
      witchHealUsed: false,
      witchPoisonUsed: false,
      ancienAttacks: 0,
      salvateurLastTarget: null,
      salvateurLastNight: null,
      filleDeJoieLastHost: null,
      filleDeJoieLastNight: null,
      renardLost: false,
      chienLoupCamp: null,
      angeChoice: null,
      loupNoirUsed: false,
      loupBavardUsed: false,
      ravenTarget: null,
      lovers: null,
    },
    night: null,
    vote: null,
    votes: [],
    events: [],
    wolfChat: [],
    pendingTriggers: [],
    winner: null,
    winnerIds: [],
    rolesDistributed: false,
    revealing: false,
    sawCard: [],
  };
  addEvent(game, 'gm', 'system', `Partie créée (code ${code}).`);
  return game;
}

function clampInt(v: unknown, min: number, max: number, d: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return d;
  return Math.min(max, Math.max(min, n));
}

export function roundLabel(game: Game): string {
  if (game.phase === 'night') return `Nuit ${game.nightNumber}`;
  if (game.phase === 'day') return `Jour ${game.dayNumber}`;
  if (game.phase === 'ended') return 'Fin de partie';
  return 'Préparation';
}

export function addEvent(game: Game, visibility: GameEvent['visibility'], type: GameEvent['type'], text: string) {
  game.events.push({
    id: uid(),
    at: Date.now(),
    phase: game.phase,
    round: game.phase === 'night' ? game.nightNumber : game.dayNumber,
    visibility,
    type,
    text,
  });
  if (game.events.length > 3000) game.events.splice(0, game.events.length - 3000);
}

export function getPlayer(game: Game, id: unknown): PlayerInternal {
  const p = game.players.find((x) => x.id === id);
  if (!p) throw new GameError('Joueur introuvable.');
  return p;
}

const nameOf = (game: Game, id: string | null | undefined) => game.players.find((p) => p.id === id)?.name ?? '—';
const roleName = (r: RoleId | null) => (r ? ROLES[r].name : 'aucun rôle');
const alivePlayers = (game: Game) => game.players.filter((p) => p.alive);
const holders = (game: Game, role: RoleId) => game.players.filter((p) => p.roleId === role);
const aliveHolder = (game: Game, role: RoleId) => holders(game, role).find((p) => p.alive);

/** Membre de la meute (attaques collectives + chat privé). */
export function isPackMember(game: Game, p: PlayerState): boolean {
  if (!p.roleId) return false;
  if (PACK_ROLES.includes(p.roleId)) return true;
  return p.roleId === 'chienLoup' && game.powers.chienLoupCamp === 'loups';
}

/** Un « loup » au sens du flair du Renard. */
export function isWolfForFox(game: Game, p: PlayerState): boolean {
  return isPackMember(game, p);
}

function requireStatus(game: Game, ...statuses: GameStatus[]) {
  if (!statuses.includes(game.status)) {
    const msg: Record<GameStatus, string> = {
      lobby: 'la partie n’a pas encore commencé',
      running: 'la partie est en cours',
      ended: 'la partie est terminée',
      cancelled: 'la partie est annulée',
    };
    throw new GameError(`Action impossible : ${msg[game.status]}.`);
  }
}

function requireAlive(game: Game, id: unknown, label = 'La cible'): PlayerInternal {
  const p = getPlayer(game, id);
  if (!p.alive) throw new GameError(`${label} (${p.name}) est déjà éliminé(e).`);
  return p;
}

/* ------------------------------------------------------------------ */
/* Préparation                                                         */
/* ------------------------------------------------------------------ */

export function updateSettings(game: Game, s: Partial<GameSettings>) {
  if (s.expectedPlayers !== undefined) {
    requireStatus(game, 'lobby');
    game.settings.expectedPlayers = clampInt(s.expectedPlayers, MIN_PLAYERS, MAX_PLAYERS, game.settings.expectedPlayers);
  }
  if (s.piperCharmCount !== undefined) game.settings.piperCharmCount = clampInt(s.piperCharmCount, 1, 5, 2);
}

export function setComposition(game: Game, comp: Partial<Record<RoleId, number>>) {
  requireStatus(game, 'lobby');
  const next: Partial<Record<RoleId, number>> = {};
  for (const [id, raw] of Object.entries(comp ?? {})) {
    const role = ROLES[id as RoleId];
    if (!role) throw new GameError(`Rôle inconnu : ${id}`);
    const n = clampInt(raw, 0, MAX_PLAYERS, 0);
    if (n === 0) continue;
    if (!role.multiple && n > 1) throw new GameError(`Le rôle ${role.name} ne peut être présent qu’une fois.`);
    next[id as RoleId] = n;
  }
  game.composition = next;
  // Toute modification de composition invalide une distribution existante.
  if (game.rolesDistributed || game.players.some((p) => p.roleId)) clearRoles(game);
}

export function addPlayer(game: Game, rawName: unknown): PlayerInternal {
  requireStatus(game, 'lobby');
  const name = String(rawName ?? '').replace(/\s+/g, ' ').trim();
  if (name.length < 1 || name.length > 20) throw new GameError('Le pseudonyme doit contenir entre 1 et 20 caractères.');
  if (game.players.length >= MAX_PLAYERS) throw new GameError('La partie est complète.');
  if (game.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
    throw new GameError('Ce pseudonyme est déjà pris dans cette partie.');
  const p: PlayerInternal = {
    id: uid(),
    token: newToken(),
    name,
    seat: game.players.length,
    alive: true,
    connected: false,
    roleId: null,
    originalRoleId: null,
    revealed: false,
    charmed: false,
    whispers: [],
    joinedAt: Date.now(),
  };
  game.players.push(p);
  addEvent(game, 'gm', 'system', `${name} a rejoint la partie.`);
  if (game.rolesDistributed) clearRoles(game);
  return p;
}

export function removePlayer(game: Game, playerId: string) {
  requireStatus(game, 'lobby');
  const p = getPlayer(game, playerId);
  game.players = game.players.filter((x) => x.id !== p.id);
  game.players.forEach((x, i) => (x.seat = i));
  addEvent(game, 'gm', 'system', `${p.name} a été retiré(e) de la partie.`);
  if (game.rolesDistributed || game.players.some((x) => x.roleId)) clearRoles(game);
}

/** Ordre des joueurs autour de la table (utilisé par le Renard). */
export function reorderPlayers(game: Game, ids: string[]) {
  if (!Array.isArray(ids) || ids.length !== game.players.length || new Set(ids).size !== ids.length)
    throw new GameError('Ordre invalide.');
  const sorted = ids.map((id) => getPlayer(game, id));
  sorted.forEach((p, i) => (p.seat = i));
  game.players = sorted;
}

export function clearRoles(game: Game) {
  for (const p of game.players) {
    p.roleId = null;
    p.originalRoleId = null;
  }
  game.rolesDistributed = false;
}

function compositionList(game: Game): RoleId[] {
  const list: RoleId[] = [];
  for (const [id, n] of Object.entries(game.composition)) for (let i = 0; i < (n ?? 0); i++) list.push(id as RoleId);
  return list;
}

function checkCountsMatch(game: Game) {
  const total = compositionTotal(game.composition);
  if (game.players.length === 0) throw new GameError('Aucun joueur n’a rejoint la partie.');
  if (total !== game.players.length)
    throw new GameError(`La composition compte ${total} rôle(s) pour ${game.players.length} joueur(s).`);
}

export function distributeRandom(game: Game) {
  requireStatus(game, 'lobby');
  checkCountsMatch(game);
  const roles = compositionList(game);
  // Mélange de Fisher-Yates avec un générateur cryptographique.
  for (let i = roles.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  game.players.forEach((p, i) => {
    p.roleId = roles[i];
    p.originalRoleId = roles[i];
  });
  game.rolesDistributed = true;
  addEvent(game, 'gm', 'role', 'Rôles distribués aléatoirement.');
}

export function assignRole(game: Game, playerId: string, roleId: RoleId | null) {
  requireStatus(game, 'lobby');
  const p = getPlayer(game, playerId);
  if (roleId !== null && !ROLES[roleId]) throw new GameError('Rôle inconnu.');
  p.roleId = roleId;
  p.originalRoleId = roleId;
  game.rolesDistributed = manualDistributionValid(game) === null;
}

/** Retourne un message d'erreur si la distribution manuelle ne correspond pas à la composition. */
export function manualDistributionValid(game: Game): string | null {
  if (game.players.length === 0) return 'Aucun joueur.';
  if (game.players.some((p) => !p.roleId)) return 'Tous les joueurs n’ont pas encore de rôle.';
  const counts: Partial<Record<RoleId, number>> = {};
  for (const p of game.players) counts[p.roleId!] = (counts[p.roleId!] ?? 0) + 1;
  for (const id of new Set([...Object.keys(counts), ...Object.keys(game.composition)]) as Set<RoleId>) {
    if ((counts[id] ?? 0) !== (game.composition[id] ?? 0))
      return `Le rôle ${ROLES[id].name} est attribué ${counts[id] ?? 0} fois au lieu de ${game.composition[id] ?? 0}.`;
  }
  return null;
}

export function startGame(game: Game) {
  requireStatus(game, 'lobby');
  if (game.players.length < MIN_PLAYERS) throw new GameError(`Il faut au moins ${MIN_PLAYERS} joueurs.`);
  if (game.players.length !== game.settings.expectedPlayers)
    throw new GameError(`${game.players.length} joueur(s) présent(s) pour ${game.settings.expectedPlayers} attendus.`);
  checkCountsMatch(game);
  const err = manualDistributionValid(game);
  if (err) throw new GameError(err);
  game.status = 'running';
  game.phase = 'night';
  game.nightNumber = 1;
  game.night = newNight(1);
  game.revealing = true;
  game.sawCard = [];
  addEvent(game, 'public', 'phase', 'La partie commence : chacun découvre secrètement sa carte.');
  addEvent(
    game,
    'gm',
    'role',
    'Distribution : ' + game.players.map((p) => `${p.name} → ${roleName(p.roleId)}`).join(', '),
  );
}

/* ------------------------------------------------------------------ */
/* Phases                                                              */
/* ------------------------------------------------------------------ */

function newNight(n: number): NightState {
  return { number: n, awake: null, actions: {}, validated: false, deaths: [] };
}

export function startNight(game: Game) {
  requireStatus(game, 'running');
  // Après la nuit de préparation, le MJ peut passer directement à la nuit 2.
  const fromPrepNight = game.phase === 'night' && game.nightNumber === 1 && game.night?.validated;
  if (game.phase !== 'day' && !fromPrepNight) throw new GameError('La nuit ne peut tomber que pendant la journée.');
  if (game.vote?.status === 'open') throw new GameError('Fermez le vote en cours avant la tombée de la nuit.');
  if (game.pendingTriggers.length) throw new GameError('Résolvez d’abord les conséquences en attente (Chasseur, amoureux, Chef).');
  if (fromPrepNight) announceNightOutcome(game);
  game.vote = null;
  game.nightNumber++;
  game.debate = null;
  game.phase = 'night';
  game.night = newNight(game.nightNumber);
  addEvent(game, 'public', 'phase', `La nuit ${game.nightNumber} tombe sur le village.`);
}

/** Annonce publique des conséquences d'une nuit (morts, transformation). */
function announceNightOutcome(game: Game) {
  const night = game.night!;
  const deaths = night.deaths.map((id) => getPlayer(game, id));
  if (deaths.length)
    addEvent(game, 'public', 'death', `Cette nuit, ${deaths.map((p) => (p.revealed ? `${p.name} (${roleName(p.roleId)})` : p.name)).join(', ')} ${deaths.length > 1 ? 'ont' : 'a'} péri.`);
  if (night.transformed) addEvent(game, 'public', 'role', 'Une personne a rejoint les Loups-Garous cette nuit.');
}

export function startDay(game: Game) {
  requireStatus(game, 'running');
  if (game.phase !== 'night' || !game.night) throw new GameError('Le jour ne peut se lever qu’après une nuit.');
  if (!game.night.validated) throw new GameError('Validez d’abord le bilan de la nuit.');
  game.dayNumber++;
  game.phase = 'day';
  addEvent(game, 'public', 'phase', `Le jour ${game.dayNumber} se lève.${game.night.deaths.length ? '' : ' Personne n’est mort cette nuit.'}`);
  announceNightOutcome(game);
}

/* ------------------------------------------------------------------ */
/* Nuit : réveils et actions                                           */
/* ------------------------------------------------------------------ */

function requireNight(game: Game): NightState {
  requireStatus(game, 'running');
  if (game.revealing) throw new GameError('Clôturez d’abord la période de révélation.');
  if (game.phase !== 'night' || !game.night) throw new GameError('Action réservée à la nuit.');
  if (game.night.validated) throw new GameError('La nuit a déjà été validée.');
  return game.night;
}

/** Un joueur a retourné sa carte pendant la révélation. */
export function markCardSeen(game: Game, playerId: string) {
  if (!game.revealing) return;
  const list = (game.sawCard ??= []);
  if (!list.includes(playerId)) list.push(playerId);
}

/** Le MJ clôt la révélation : la première nuit commence, les cartes se retournent. */
export function closeReveal(game: Game) {
  requireStatus(game, 'running');
  if (!game.revealing) throw new GameError('La période de révélation est déjà close.');
  game.revealing = false;
  addEvent(game, 'public', 'phase', 'Les cartes se retournent. La première nuit tombe sur le village…');
}

/** Actions disponibles cette nuit (rôle présent et vivant, conditions remplies). */
export function availableNightActions(game: Game): { key: NightActionKey; reason?: string }[] {
  if (!game.night) return [];
  const n = game.night.number;
  const res: { key: NightActionKey; reason?: string }[] = [];
  for (const a of NIGHT_ACTIONS) {
    let reason: string | undefined;
    if (a.role === 'pack') {
      if (!game.players.some((p) => p.alive && isPackMember(game, p))) continue;
    } else {
      if (!holders(game, a.role).length) continue;
      if (!aliveHolder(game, a.role)) reason = 'Rôle éliminé';
    }
    if (a.firstNightOnly && n !== 1) continue;
    // Nuit 1 = nuit de préparation : seuls Cupidon, Chien-Loup et Ange Déchu agissent.
    if (!a.firstNightOnly && n === 1) continue;
    if (a.key === 'chienLoup' && game.powers.chienLoupCamp) continue;
    if (a.key === 'angeDechu' && game.powers.angeChoice) continue;
    if (a.key === 'cupidon' && game.powers.lovers) continue;
    if (a.key === 'renard' && game.powers.renardLost) reason = 'Pouvoir perdu';
    // Le Loup Noir n'agit pas lors de la première nuit de chasse (nuit 2).
    if (a.key === 'loupNoir' && n <= 2) continue;
    if (a.key === 'loupNoir' && game.powers.loupNoirUsed) reason = 'Pouvoir déjà utilisé';
    // Le Loup Bavard est appelé chaque nuit (pour ne pas se trahir), mais n'agit qu'une fois.
    if (a.key === 'loupBavard' && (game.powers.loupBavardUsed || game.powers.bavardPending)) reason = 'Pouvoir déjà utilisé';
    if (a.key === 'loupBlanc' && (n < 3 || n % 2 === 0)) continue; // nuits 3, 5, 7… seulement
    if (a.key === 'sorciere' && game.powers.witchHealUsed && game.powers.witchPoisonUsed) reason = 'Potions épuisées';
    res.push({ key: a.key, reason });
  }
  return res;
}

export const WOLF_SECONDS = Number(process.env.WOLF_SECONDS) || 35;

/** Un loup propose (ou retire, targetId = null) une proie ; tous les loups la voient. */
export function wolfSuggest(game: Game, playerId: string, targetId: string | null) {
  const night = requireNight(game);
  if (night.awake !== 'loups' || !night.wolfDeadline) throw new GameError('La meute n’est pas réveillée.');
  if (night.actions.loups) throw new GameError('La meute a déjà choisi.');
  if (Date.now() > night.wolfDeadline) throw new GameError('Le temps est écoulé.');
  const p = getPlayer(game, playerId);
  if (!p.alive || !isPackMember(game, p)) throw new GameError('Action non autorisée.');
  const sug = (night.wolfSuggestions ??= {});
  if (!targetId) { delete sug[playerId]; return; }
  requireAlive(game, targetId);
  if (targetId === playerId) throw new GameError('Choisissez un autre joueur que vous.');
  if (isPackMember(game, getPlayer(game, targetId))) throw new GameError('La meute ne peut pas attaquer un loup.');
  sug[playerId] = targetId;
}

/** Fin du chrono : la proie la plus suggérée est retenue (égalité : tirage au sort). */
export function resolveWolfVote(game: Game): boolean {
  const night = game.night;
  if (!night || night.validated || !night.wolfDeadline || night.actions.loups) return false;
  night.wolfDeadline = undefined;
  const counts = new Map<string, number>();
  for (const [wolfId, t] of Object.entries(night.wolfSuggestions ?? {})) {
    const w = game.players.find((p) => p.id === wolfId);
    const target = game.players.find((p) => p.id === t);
    if (!w?.alive || !isPackMember(game, w) || !target?.alive) continue;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (!counts.size) {
    addEvent(game, 'gm', 'action', 'Fin du temps : la meute n’a désigné aucune proie.');
    return true;
  }
  const max = Math.max(...counts.values());
  const top = [...counts].filter(([, c]) => c === max).map(([id]) => id);
  const pick = top[Math.floor(Math.random() * top.length)];
  recordAction(game, 'loups', { targets: [pick] });
  return true;
}

export function wake(game: Game, key: NightActionKey | null) {
  const night = requireNight(game);
  if (key !== null && !NIGHT_ACTIONS.some((a) => a.key === key)) throw new GameError('Action inconnue.');
  night.awake = key;
  // Réveil de la meute : 1 minute de concertation, suggestions remises à zéro.
  if (key === 'loups' && !night.actions.loups && availableNightActions(game).some((a) => a.key === 'loups' && !a.reason) && !(night.wolfDeadline && night.wolfDeadline > Date.now())) {
    night.wolfDeadline = Date.now() + WOLF_SECONDS * 1000;
    night.wolfSuggestions = {};
  }
  if (key) addEvent(game, 'gm', 'action', `Réveil : ${NIGHT_ACTIONS.find((a) => a.key === key)!.title}.`);
}

/** Vrai si ce joueur a le droit d'enregistrer cette action depuis son téléphone. */
export function canPlayerAct(game: Game, playerId: string, key: NightActionKey): boolean {
  if (game.revealing) return false;
  const p = game.players.find((x) => x.id === playerId);
  if (!p || !p.alive || game.phase !== 'night' || !game.night || game.night.validated) return false;
  if (game.night.awake !== key) return false;
  const avail = availableNightActions(game).find((a) => a.key === key);
  if (!avail || avail.reason) return false;
  const info = NIGHT_ACTIONS.find((a) => a.key === key)!;
  if (info.role === 'pack') return isPackMember(game, p);
  return p.roleId === info.role;
}

export function recordAction(game: Game, key: NightActionKey, payload: Partial<NightActionRecord>) {
  const night = requireNight(game);
  const avail = availableNightActions(game).find((a) => a.key === key);
  if (!avail) throw new GameError('Cette action n’est pas disponible cette nuit.');
  if (avail.reason) throw new GameError(`Action indisponible : ${avail.reason}.`);
  const targets = Array.isArray(payload.targets) ? payload.targets.map(String) : [];
  const rec: NightActionRecord = { key, targets: [], recordedAt: Date.now(), note: String(payload.note ?? '').slice(0, 300) || undefined };
  const one = () => {
    if (targets.length !== 1) throw new GameError('Choisissez exactement un joueur.');
    requireAlive(game, targets[0]);
    rec.targets = [targets[0]];
  };

  switch (key) {
    case 'cupidon': {
      if (targets.length !== 2 || targets[0] === targets[1]) throw new GameError('Choisissez deux amoureux différents.');
      targets.forEach((t) => requireAlive(game, t));
      rec.targets = targets;
      break;
    }
    case 'chienLoup': {
      if (payload.choice !== 'village' && payload.choice !== 'loups') throw new GameError('Choisissez un camp.');
      rec.choice = payload.choice;
      break;
    }
    case 'angeDechu': {
      if (payload.choice !== 'survie' && payload.choice !== 'elimination') throw new GameError('Choisissez la voie de l’Ange.');
      rec.choice = payload.choice;
      break;
    }
    case 'loups':
      one();
      if (isPackMember(game, getPlayer(game, rec.targets[0]))) throw new GameError('La meute ne peut pas attaquer un loup.');
      break;
    case 'voyante':
    case 'renard':
    case 'corbeau':
    case 'loupBlanc':
      one();
      break;
    case 'loupBavard': {
      const choice = payload.choice;
      if (choice !== 'annuler' && choice !== 'rediriger' && choice !== 'passer') throw new GameError('Choisissez : annuler, rediriger ou ne rien faire.');
      rec.choice = choice;
      if (choice === 'passer') break;
      const bavard = aliveHolder(game, 'loupBavard');
      const need = choice === 'rediriger' ? 2 : 1;
      if (targets.length !== need) throw new GameError(choice === 'rediriger' ? 'Choisissez le joueur visé et vers qui rediriger son vote.' : 'Choisissez le joueur dont le vote sera annulé.');
      targets.forEach((t) => requireAlive(game, t));
      if (bavard && targets[0] === bavard.id) throw new GameError('Choisissez un autre joueur que vous.');
      if (choice === 'rediriger' && targets[0] === targets[1]) throw new GameError('Un joueur ne peut pas se désigner lui-même.');
      rec.targets = targets;
      break;
    }
    case 'filleDeJoie': {
      one();
      const fille = aliveHolder(game, 'filleDeJoie');
      if (fille && rec.targets[0] === fille.id) throw new GameError('La Fille de joie doit dormir chez quelqu’un d’autre.');
      if (game.powers.filleDeJoieLastHost === rec.targets[0] && game.powers.filleDeJoieLastNight === night.number - 1)
        throw new GameError('La Fille de joie ne peut pas dormir chez la même personne deux nuits de suite.');
      break;
    }
    case 'salvateur': {
      one();
      if (game.powers.salvateurLastTarget === rec.targets[0] && game.powers.salvateurLastNight === night.number - 1)
        throw new GameError('Le Salvateur ne peut pas protéger le même joueur deux nuits consécutives.');
      break;
    }
    case 'loupNoir': {
      if (payload.choice !== 'transformer' && payload.choice !== 'non') throw new GameError('Choix invalide.');
      rec.choice = payload.choice;
      break;
    }
    case 'sorciere': {
      const heal = payload.heal ? String(payload.heal) : null;
      const poison = payload.poison ? String(payload.poison) : null;
      if (heal) {
        if (game.powers.witchHealUsed) throw new GameError('La potion de guérison a déjà été utilisée.');
        requireAlive(game, heal);
      }
      if (poison) {
        if (game.powers.witchPoisonUsed) throw new GameError('La potion d’empoisonnement a déjà été utilisée.');
        requireAlive(game, poison);
      }
      rec.heal = heal;
      rec.poison = poison;
      break;
    }
    case 'joueurDeFlute': {
      const max = game.settings.piperCharmCount;
      if (targets.length < 1 || targets.length > max) throw new GameError(`Choisissez de 1 à ${max} joueur(s) à enchanter.`);
      if (new Set(targets).size !== targets.length) throw new GameError('Joueurs en double.');
      const piper = aliveHolder(game, 'joueurDeFlute');
      targets.forEach((t) => {
        requireAlive(game, t);
        if (piper && t === piper.id) throw new GameError('Le Joueur de Flûte ne s’enchante pas lui-même.');
      });
      rec.targets = targets;
      break;
    }
  }
  night.actions[key] = rec;
  // Une vision obtenue chez un hôte séduit n'existe pas (la Voyante ne le sait pas).
  if (key === 'voyante' && isBlocked(game, 'voyante')) {
    addEvent(game, 'gm', 'action', `Action enregistrée (neutralisée par la Fille de joie) — ${describeAction(game, rec)}`);
    return;
  }
  if (key === 'filleDeJoie' && isBlocked(game, 'voyante') && game.powers.seerVisions)
    game.powers.seerVisions = game.powers.seerVisions.filter((v) => v.night !== night.number);
  if (key === 'voyante') {
    const t = getPlayer(game, rec.targets[0]);
    const list = (game.powers.seerVisions ??= []).filter((v) => v.night !== night.number);
    list.push({ night: night.number, targetId: t.id, roleId: t.roleId });
    game.powers.seerVisions = list;
  }
  addEvent(game, 'gm', 'action', `Action enregistrée — ${describeAction(game, rec)}`);
}

export function clearAction(game: Game, key: NightActionKey) {
  const night = requireNight(game);
  delete night.actions[key];
  if (key === 'loups') { night.wolfDeadline = undefined; night.wolfSuggestions = {}; }
  if (key === 'voyante' && game.powers.seerVisions) game.powers.seerVisions = game.powers.seerVisions.filter((v) => v.night !== night.number);
}

export function describeAction(game: Game, rec: NightActionRecord): string {
  const t = rec.targets.map((id) => nameOf(game, id)).join(' & ');
  switch (rec.key) {
    case 'cupidon': return `Cupidon unit ${t}.`;
    case 'chienLoup': return `Le Chien-Loup choisit le camp ${rec.choice === 'loups' ? 'des Loups-Garous' : 'des Villageois'}.`;
    case 'angeDechu': return `L’Ange Déchu choisit ${rec.choice === 'survie' ? 'de survivre jusqu’à la fin' : 'd’être éliminé au premier vote'}.`;
    case 'filleDeJoie': return `La Fille de joie dort chez ${t}.`;
    case 'voyante': return `La Voyante sonde ${t}.`;
    case 'renard': return `Le Renard flaire autour de ${t}.`;
    case 'salvateur': return `Le Salvateur protège ${t}.`;
    case 'loups': return `Les Loups-Garous attaquent ${t}.`;
    case 'loupNoir': return rec.choice === 'transformer' ? 'Le Loup Noir transforme la victime.' : 'Le Loup Noir ne transforme pas.';
    case 'loupBlanc': return `Le Loup Blanc attaque ${t}.`;
    case 'sorciere': {
      const parts = [];
      if (rec.heal) parts.push(`soigne ${nameOf(game, rec.heal)}`);
      if (rec.poison) parts.push(`empoisonne ${nameOf(game, rec.poison)}`);
      return `La Sorcière ${parts.length ? parts.join(' et ') : 'n’utilise aucune potion'}.`;
    }
    case 'corbeau': return `Le Corbeau désigne ${t}.`;
    case 'loupBavard': {
      if (rec.choice === 'annuler') return `Le Loup Bavard annulera le vote de ${nameOf(game, rec.targets[0])} au prochain vote.`;
      if (rec.choice === 'rediriger') return `Le Loup Bavard redirigera le vote de ${nameOf(game, rec.targets[0])} vers ${nameOf(game, rec.targets[1])} au prochain vote.`;
      return 'Le Loup Bavard garde son pouvoir pour plus tard.';
    }
    case 'joueurDeFlute': return `Le Joueur de Flûte enchante ${t}.`;
  }
}

/* ------------------------------------------------------------------ */
/* Fille de joie                                                       */
/* ------------------------------------------------------------------ */

/** Hôte séduit cette nuit par la Fille de joie (si elle est vivante et a agi). */
export function seducedHost(game: Game): string | null {
  const rec = game.night?.actions.filleDeJoie;
  if (!rec || !aliveHolder(game, 'filleDeJoie')) return null;
  return rec.targets[0] ?? null;
}

/** La Fille de joie dort ailleurs cette nuit : son identifiant, sinon null. */
export function filleAway(game: Game): string | null {
  return seducedHost(game) ? aliveHolder(game, 'filleDeJoie')!.id : null;
}

/** L'action est-elle neutralisée parce que son auteur est l'hôte de la Fille de joie ? */
export function isBlocked(game: Game, key: NightActionKey): boolean {
  const host = seducedHost(game);
  if (!host || key === 'filleDeJoie') return false;
  const info = NIGHT_ACTIONS.find((a) => a.key === key)!;
  if (info.role === 'pack') {
    // L'attaque collective n'est annulée que si l'hôte est le seul loup encore debout.
    const pack = game.players.filter((p) => p.alive && isPackMember(game, p));
    return pack.length > 0 && pack.every((p) => p.id === host);
  }
  return getPlayer(game, host).roleId === info.role;
}

/** Actions de la nuit réellement appliquées (sans celles de l'hôte séduit). */
export function effectiveActions(game: Game): NightState['actions'] {
  const all = game.night?.actions ?? {};
  const out: NightState['actions'] = {};
  for (const [k, v] of Object.entries(all) as [NightActionKey, NightActionRecord][]) if (!isBlocked(game, k)) out[k] = v;
  return out;
}

/** Voisins vivants d'un joueur dans l'ordre de la table (pour le Renard). */
export function foxGroup(game: Game, targetId: string): PlayerInternal[] {
  const alive = alivePlayers(game).sort((a, b) => a.seat - b.seat);
  const idx = alive.findIndex((p) => p.id === targetId);
  if (idx < 0) return [];
  if (alive.length <= 3) return alive;
  return [alive[(idx - 1 + alive.length) % alive.length], alive[idx], alive[(idx + 1) % alive.length]];
}

/** Victimes qui doivent réellement mourir cette nuit (présentées à la Sorcière). */
export function nightVictims(game: Game): string[] {
  const a = effectiveActions(game);
  const prot = a.salvateur?.targets[0];
  const away = filleAway(game);
  const res: string[] = [];
  const w = a.loups?.targets[0];
  if (w && w !== away && a.loupNoir?.choice !== 'transformer' && w !== prot && !(getPlayer(game, w).roleId === 'ancien' && game.powers.ancienAttacks === 0)) res.push(w);
  const b = a.loupBlanc?.targets[0];
  if (b && b !== prot && b !== away && !res.includes(b)) res.push(b);
  // La Fille de joie meurt avec l'hôte attaqué (la potion de guérison peut aussi la sauver).
  const host = seducedHost(game);
  if (away && host && res.includes(host) && !res.includes(away)) res.push(away);
  return res;
}

/** Résultat des attaques : protection, transformation, résistance de l'Ancien, guérison. */
function attackOutcome(game: Game) {
  const a = effectiveActions(game);
  const victimId = a.loups?.targets[0];
  const prot = a.salvateur?.targets[0];
  const transform = !!victimId && a.loupNoir?.choice === 'transformer';
  const ancienShield = !!victimId && !transform && victimId !== prot && getPlayer(game, victimId).roleId === 'ancien' && game.powers.ancienAttacks === 0;
  const dying = nightVictims(game);
  const healedId = a.sorciere?.heal && dying.includes(a.sorciere.heal) ? a.sorciere.heal : null;
  return {
    transform,
    ancienShield,
    protectedIds: prot ? [prot] : [],
    healedId,
    /** La potion n'est consommée que si elle sauve une victime qui devait réellement mourir. */
    healConsumed: !!healedId,
    /** Attaque réussie de la meute (pour l'Ancien). */
    packAttackSucceeded: !!victimId && !transform && victimId !== prot,
  };
}

/**
 * Calcule les conséquences PROPOSÉES de la nuit, sans rien appliquer.
 * Les identifiants sont déterministes afin que le Maître du jeu puisse cocher/décocher.
 */
export function proposeConsequences(game: Game): Consequence[] {
  const night = game.night;
  if (!night) return [];
  const a = effectiveActions(game);
  const out: Consequence[] = [];
  const deaths = new Set<string>();
  const death = (id: string, label: string, cause: string, checked = true) => {
    if (!getPlayer(game, id).alive || deaths.has(id)) return;
    out.push({ id: `death:${id}:${cause}`, kind: 'death', playerId: id, label, checked });
    deaths.add(id);
  };
  const info = (label: string) => out.push({ id: `info:${out.length}`, kind: 'info', label, checked: false, informative: true });
  const whisper = (pid: string, text: string, label: string, cause: string) =>
    out.push({ id: `whisper:${pid}:${cause}`, kind: 'whisper', playerId: pid, whisper: text, label, checked: true });

  // Première nuit : choix d'identité.
  if (a.cupidon) {
    const [x, y] = a.cupidon.targets;
    whisper(x, `Cupidon vous a uni(e) à ${nameOf(game, y)}. Si l’un de vous meurt, l’autre meurt aussi.`, `Informer ${nameOf(game, x)} de son amour`, 'cupidon');
    whisper(y, `Cupidon vous a uni(e) à ${nameOf(game, x)}. Si l’un de vous meurt, l’autre meurt aussi.`, `Informer ${nameOf(game, y)} de son amour`, 'cupidon');
  }

  // Informations des rôles de renseignement.
  if (a.voyante) {
    const t = getPlayer(game, a.voyante.targets[0]);
    info(`La Voyante découvre : ${t.name} est ${roleName(t.roleId)}.`);
  }
  if (a.renard) {
    const fox = aliveHolder(game, 'renard');
    const group = foxGroup(game, a.renard.targets[0]);
    const hasWolf = group.some((p) => isWolfForFox(game, p));
    const names = group.map((p) => p.name).join(', ');
    info(`Le Renard flaire ${names} : ${hasWolf ? 'au moins un loup' : 'aucun loup'}.`);
    if (fox)
      whisper(fox.id, `Nuit ${night.number} — Parmi ${names} : ${hasWolf ? 'au moins un loup rôde.' : 'aucun loup. Vous perdez votre flair.'}`, 'Transmettre le résultat au Renard', 'renard');
    if (!hasWolf) out.push({ id: 'renardLost', kind: 'renardLost', label: 'Le Renard perd définitivement son pouvoir', checked: true });
  }

  // Fille de joie : hôte séduit, actions neutralisées.
  const host = seducedHost(game);
  const away = filleAway(game);
  if (host) {
    const blocked = (Object.keys(night.actions) as NightActionKey[]).filter((k) => isBlocked(game, k));
    info(`La Fille de joie dort chez ${nameOf(game, host)}${blocked.length ? ` : action neutralisée (${blocked.map((k) => NIGHT_ACTIONS.find((x) => x.key === k)!.title).join(', ')})` : ''}.`);
  }

  // Attaques de la nuit (meute + Loup Blanc).
  const outcome = attackOutcome(game);
  const victimId = a.loups?.targets[0];
  if (victimId && victimId === away) info(`Les loups attaquent ${nameOf(game, away)}, mais la Fille de joie dort chez ${nameOf(game, host!)} : elle survit.`);
  else if (victimId) {
    const victim = getPlayer(game, victimId);
    if (outcome.transform) {
      // Le Salvateur ne bloque pas la transformation du Loup Noir.
      out.push({ id: `transform:${victimId}`, kind: 'transform', playerId: victimId, label: `${victim.name} est transformé(e) en Simple Loup par le Loup Noir`, checked: true });
      whisper(victimId, 'Le Loup Noir vous a mordu(e) : vous êtes désormais un Simple Loup et rejoignez la meute.', `Informer ${victim.name} de sa transformation`, 'loupNoir');
    } else if (outcome.protectedIds.includes(victimId)) info(`${victim.name} était protégé(e) par le Salvateur : l’attaque des loups échoue.`);
    else if (outcome.ancienShield) {
      out.push({ id: `ancien:${victimId}`, kind: 'ancienShield', playerId: victimId, label: `${victim.name} (Ancien) survit à cette première attaque réussie`, checked: true });
    } else if (outcome.healedId === victimId) info(`${victim.name} est sauvé(e) par la potion de guérison de la Sorcière.`);
    else death(victimId, `${victim.name} est dévoré(e) par les Loups-Garous`, 'loups');
  }
  const whiteId = a.loupBlanc?.targets[0];
  if (whiteId && whiteId === away) info(`Le Loup Blanc trouve la maison de la Fille de joie vide : elle survit.`);
  else if (whiteId) {
    if (outcome.protectedIds.includes(whiteId)) info(`${nameOf(game, whiteId)} était protégé(e) par le Salvateur contre le Loup Blanc.`);
    else if (outcome.healedId === whiteId) info(`${nameOf(game, whiteId)} est sauvé(e) de l’attaque du Loup Blanc par la Sorcière.`);
    else death(whiteId, `${nameOf(game, whiteId)} est dévoré(e) par le Loup Blanc`, 'loupBlanc');
  }
  // L'hôte dévoré entraîne la Fille de joie dans la mort.
  if (away && host && (deaths.has(host) && out.some((c) => c.id === `death:${host}:loups` || c.id === `death:${host}:loupBlanc`))) {
    if (outcome.healedId === away) info(`${nameOf(game, away)} (Fille de joie) est sauvée par la Sorcière.`);
    else death(away, `${nameOf(game, away)} (Fille de joie) dormait chez ${nameOf(game, host)} : elle périt avec son hôte`, 'filleDeJoie');
  }
  if (a.sorciere?.heal && !outcome.healConsumed)
    info(`La potion de guérison sur ${nameOf(game, a.sorciere.heal)} n’est pas nécessaire : elle ne sera pas consommée.`);
  if (a.sorciere?.poison) death(a.sorciere.poison, `${nameOf(game, a.sorciere.poison)} est empoisonné(e) par la Sorcière`, 'poison');

  // Amoureux : si l'un meurt, l'autre meurt aussi.
  const lovers = game.powers.lovers ?? (a.cupidon ? (a.cupidon.targets as [string, string]) : null);
  if (lovers) {
    for (const [x, y] of [[lovers[0], lovers[1]], [lovers[1], lovers[0]]]) {
      if (deaths.has(x) && !deaths.has(y) && getPlayer(game, y).alive) death(y, `${nameOf(game, y)} était lié(e) par Cupidon à ${nameOf(game, x)} : il/elle meurt de chagrin`, 'chagrin');
    }
  }
  for (const id of deaths) {
    if (getPlayer(game, id).roleId === 'chasseur') info(`${nameOf(game, id)} est le Chasseur : il tirera au lever du jour, après l’annonce des morts.`);
  }
  if (a.corbeau) info(`${nameOf(game, a.corbeau.targets[0])} recevra 2 voix supplémentaires au prochain vote.`);
  if (a.loupBavard && a.loupBavard.choice !== 'passer') info(describeAction(game, a.loupBavard));
  if (a.joueurDeFlute) info(`Enchantés cette nuit : ${a.joueurDeFlute.targets.map((t) => nameOf(game, t)).join(', ')}.`);
  return out;
}

/**
 * Validation manuelle de la nuit par le Maître du jeu.
 * @param checkedIds identifiants des conséquences cochées
 * @param extraDeaths morts supplémentaires ajoutées à la main
 */
export function validateNight(
  game: Game,
  checkedIds: string[],
  extraDeaths: { playerId: string; reason: string }[] = [],
  revealRoles = true,
) {
  const night = requireNight(game);
  const checked = new Set(checkedIds ?? []);
  const proposals = proposeConsequences(game);
  const a = effectiveActions(game);
  const p = game.powers;
  if (night.actions.filleDeJoie && seducedHost(game)) {
    p.filleDeJoieLastHost = night.actions.filleDeJoie.targets[0];
    p.filleDeJoieLastNight = night.number;
  }

  // 1. États des pouvoirs (toujours appliqués : ce sont les choix enregistrés).
  if (a.cupidon) {
    p.lovers = [a.cupidon.targets[0], a.cupidon.targets[1]];
    addEvent(game, 'gm', 'action', `Amoureux : ${nameOf(game, p.lovers[0])} ❤ ${nameOf(game, p.lovers[1])}.`);
  }
  if (a.chienLoup) p.chienLoupCamp = a.chienLoup.choice as 'village' | 'loups';
  if (a.angeDechu) p.angeChoice = a.angeDechu.choice as 'survie' | 'elimination';
  if (a.salvateur) {
    p.salvateurLastTarget = a.salvateur.targets[0];
    p.salvateurLastNight = night.number;
  }
  const outcome = attackOutcome(game);
  if (outcome.healConsumed) p.witchHealUsed = true;
  if (a.sorciere?.poison) p.witchPoisonUsed = true;
  if (a.corbeau) p.ravenTarget = a.corbeau.targets[0];
  // Loup Bavard : son unique effet est mis de côté pour le prochain vote du village.
  const lb = a.loupBavard;
  const lbHolder = aliveHolder(game, 'loupBavard');
  if (lb && lbHolder && (lb.choice === 'annuler' || lb.choice === 'rediriger') && !p.loupBavardUsed) {
    p.bavardPending = { byPlayerId: lbHolder.id, targetVoterId: lb.targets[0], effect: lb.choice, redirectTo: lb.choice === 'rediriger' ? lb.targets[1] : undefined };
    p.loupBavardUsed = true;
  }
  if (a.joueurDeFlute) for (const t of a.joueurDeFlute.targets) getPlayer(game, t).charmed = true;

  // 2. Conséquences cochées.
  for (const c of proposals) {
    if (c.informative || !checked.has(c.id)) continue;
    switch (c.kind) {
      case 'death':
        killPlayer(game, c.playerId!, c.label, revealRoles, night);
        break;
      case 'transform': {
        const v = getPlayer(game, c.playerId!);
        v.roleId = 'loup';
        p.loupNoirUsed = true;
        night.transformed = true;
        addEvent(game, 'gm', 'role', `${v.name} devient un Simple Loup.`);
        break;
      }
      case 'ancienShield':
        p.ancienAttacks++;
        addEvent(game, 'gm', 'action', c.label + '.');
        break;
      case 'renardLost':
        p.renardLost = true;
        addEvent(game, 'gm', 'action', 'Le Renard perd son pouvoir.');
        break;
      case 'whisper':
        sendWhisper(game, c.playerId!, c.whisper!);
        break;
    }
  }
  // Une attaque réussie de la meute sur l'Ancien (qui le tue) compte aussi.
  const victim = a.loups?.targets[0];
  if (victim && outcome.packAttackSucceeded && !outcome.ancienShield && getPlayer(game, victim).roleId === 'ancien') p.ancienAttacks++;

  for (const d of extraDeaths ?? []) {
    const reason = String(d.reason ?? '').slice(0, 120) || 'Éliminé(e) par décision du Maître du jeu';
    const target = getPlayer(game, d.playerId);
    if (!target.alive) continue;
    killPlayer(game, target.id, `${target.name} — ${reason}`, revealRoles, night);
    loverHeartbreak(game, target.id, night);
  }

  night.validated = true;
  night.awake = null;
  addEvent(game, 'gm', 'action', `Nuit ${night.number} validée.`);
}

/* ------------------------------------------------------------------ */
/* Éliminations                                                        */
/* ------------------------------------------------------------------ */

function killPlayer(game: Game, playerId: string, reason: string, reveal: boolean, night?: NightState) {
  const p = getPlayer(game, playerId);
  if (!p.alive) return;
  p.alive = false;
  p.revealed = reveal;
  p.deathReason = reason;
  p.deathRound = roundLabel(game);
  if (night) night.deaths.push(p.id);
  if (game.chiefId === p.id) {
    game.chiefId = null;
    game.pendingTriggers.push({ id: uid(), type: 'chief', playerId: p.id });
    if (night) night.chiefDied = p.id;
  }
  addEvent(game, night ? 'gm' : 'public', 'death', `${reason}${reveal ? ` — rôle : ${roleName(p.roleId)}` : ''}.`);

  // Déclencheurs à résoudre par le Maître du jeu.
  if (p.roleId === 'chasseur') game.pendingTriggers.push({ id: uid(), type: 'hunter', playerId: p.id });
  if (!night) loverHeartbreak(game, p.id);
}

export function eliminate(game: Game, playerId: string, reason: string, reveal = true, cause?: 'vote') {
  requireStatus(game, 'running');
  const p = requireAlive(game, playerId, 'Le joueur');
  // Ange Déchu : éliminé lors du premier vote du village.
  if (cause === 'vote' && game.vote && game.vote.id === game.firstEliminationVoteId && p.roleId === 'angeDechu' && game.powers.angeChoice === 'elimination') {
    game.powers.angeWon = true;
    addEvent(game, 'gm', 'action', `${p.name} (Ange Déchu) est éliminé lors du premier vote : sa condition de victoire est remplie.`);
  }
  const why = String(reason ?? '').trim().slice(0, 120) || 'Éliminé(e)';
  // Pendant la nuit (après validation), les morts sont annoncées au lever du jour.
  const inNight = game.phase === 'night' && game.night ? game.night : undefined;
  if (cause === 'vote') game.lastVerdict = { id: uid(), playerId: p.id, day: game.dayNumber };
  killPlayer(game, p.id, `${p.name} — ${why}`, reveal, inNight);
  if (inNight) loverHeartbreak(game, p.id, inNight);
}

/** Amoureux : la mort de l'un emporte automatiquement l'autre, carte dévoilée devant tout le monde. */
function loverHeartbreak(game: Game, playerId: string, night?: NightState) {
  const lovers = game.powers.lovers;
  if (!lovers || !lovers.includes(playerId)) return;
  const partner = lovers[0] === playerId ? lovers[1] : lovers[0];
  const q = getPlayer(game, partner);
  if (!q.alive) return;
  if (game.lastVerdict?.playerId === playerId) game.lastVerdict.loverId = q.id;
  killPlayer(game, q.id, `${q.name} était lié(e) par Cupidon à ${nameOf(game, playerId)} : il/elle meurt de chagrin`, true, night);
  if (night) loverHeartbreak(game, q.id, night);
}

export function revive(game: Game, playerId: string) {
  requireStatus(game, 'running');
  const p = getPlayer(game, playerId);
  if (p.alive) throw new GameError(`${p.name} est déjà en vie.`);
  p.alive = true;
  p.revealed = false;
  p.deathReason = undefined;
  p.deathRound = undefined;
  if (game.night) game.night.deaths = game.night.deaths.filter((id) => id !== p.id);
  game.pendingTriggers = game.pendingTriggers.filter((t) => t.playerId !== p.id);
  addEvent(game, 'gm', 'revive', `Correction : ${p.name} est de nouveau en vie.`);
}

export function resolveTrigger(game: Game, triggerId: string, targetId: string | null) {
  const t = game.pendingTriggers.find((x) => x.id === triggerId);
  if (!t) throw new GameError('Déclencheur introuvable.');
  if (targetId) {
    if (t.type === 'hunter' && game.phase !== 'day') throw new GameError('Le Chasseur tire au lever du jour, après l’annonce des morts.');
    if (t.type === 'hunter') eliminate(game, targetId, `abattu(e) par le Chasseur ${nameOf(game, t.playerId)}`);
    else if (t.type === 'lover') eliminate(game, t.partnerId, `meurt de chagrin (amoureux de ${nameOf(game, t.playerId)})`);
    else setChief(game, targetId);
  } else {
    const msg = { hunter: `Le tir du Chasseur ${nameOf(game, t.playerId)} est ignoré.`, lover: 'Mort de chagrin ignorée.', chief: 'Pas de nouveau Chef pour le moment.' };
    addEvent(game, 'gm', 'action', msg[t.type]);
  }
  game.pendingTriggers = game.pendingTriggers.filter((x) => x.id !== triggerId);
}

/** Le Chasseur tire lui-même depuis son téléphone. */
export function hunterShoot(game: Game, playerId: string, targetId: string) {
  requireStatus(game, 'running');
  const t = game.pendingTriggers.find((x) => x.type === 'hunter' && x.playerId === playerId);
  if (!t) throw new GameError('Aucun tir en attente.');
  if (game.phase !== 'day') throw new GameError('Vous tirerez au lever du jour, après l’annonce des morts.');
  if (targetId === playerId) throw new GameError('Choisissez un autre joueur.');
  requireAlive(game, targetId);
  resolveTrigger(game, t.id, targetId);
}

/** Le Chef mort ou éliminé désigne lui-même son successeur depuis son téléphone. */
export function chiefSuccession(game: Game, playerId: string, targetId: string) {
  requireStatus(game, 'running');
  const t = game.pendingTriggers.find((x) => x.type === 'chief' && x.playerId === playerId);
  if (!t) throw new GameError('Aucune succession en attente.');
  if (targetId === playerId) throw new GameError('Choisissez un autre joueur.');
  requireAlive(game, targetId);
  resolveTrigger(game, t.id, targetId);
}

export function setChief(game: Game, playerId: string | null) {
  requireStatus(game, 'running');
  if (playerId) {
    const p = requireAlive(game, playerId, 'Le Chef');
    game.chiefId = p.id;
    addEvent(game, 'public', 'chief', `${p.name} devient Chef du village.`);
  } else {
    game.chiefId = null;
    addEvent(game, 'public', 'chief', 'Le village n’a plus de Chef.');
  }
}

export function setCharmed(game: Game, playerId: string, charmed: boolean) {
  requireStatus(game, 'running');
  getPlayer(game, playerId).charmed = !!charmed;
}

/* ------------------------------------------------------------------ */
/* Votes                                                               */
/* ------------------------------------------------------------------ */

/** Lance, prolonge ou arrête le minuteur de débat du jour. */
export function setDebate(game: Game, seconds: unknown, extend = false) {
  requireStatus(game, 'running');
  if (game.phase !== 'day') throw new GameError('Le débat n’a lieu que le jour.');
  const n = Math.round(Number(seconds));
  if (!Number.isFinite(n) || n <= 0) { game.debate = null; return; }
  const sec = Math.min(n, 30 * 60);
  if (extend && game.debate && game.debate.endsAt > Date.now()) {
    game.debate = { endsAt: game.debate.endsAt + sec * 1000, seconds: game.debate.seconds + sec };
  } else {
    game.debate = { endsAt: Date.now() + sec * 1000, seconds: sec };
    addEvent(game, 'public', 'phase', `Le débat est ouvert : ${sec >= 60 ? `${Math.floor(sec / 60)} min${sec % 60 ? ` ${sec % 60} s` : ''}` : `${sec} s`}.`);
  }
}

export function openVote(game: Game, opts: { kind?: VoteKind; label?: string; candidates?: string[]; voters?: string[]; durationSec?: number }) {
  requireStatus(game, 'running');
  if (game.vote?.status === 'open') throw new GameError('Un vote est déjà ouvert.');
  const kind: VoteKind = opts.kind === 'chef' || opts.kind === 'autre' ? opts.kind : 'elimination';
  if (kind === 'elimination' && game.pendingTriggers.some((t) => t.type === 'chief'))
    throw new GameError('L’ancien Chef doit d’abord désigner son successeur.');
  const alive = alivePlayers(game).map((p) => p.id);
  const pick = (ids: string[] | undefined) => {
    const list = Array.isArray(ids) && ids.length ? ids.filter((id) => alive.includes(id)) : alive;
    return [...new Set(list)];
  };
  const candidates = pick(opts.candidates);
  const voters = pick(opts.voters);
  if (candidates.length < 1) throw new GameError('Aucun candidat valide.');
  if (voters.length < 1) throw new GameError('Aucun votant valide.');
  const defaults: Record<VoteKind, string> = {
    elimination: `Vote du village — Jour ${game.dayNumber}`,
    chef: 'Élection du Chef du village',
    autre: 'Vote',
  };
  game.debate = null;
  game.vote = {
    id: uid(),
    kind,
    label: String(opts.label ?? '').trim().slice(0, 80) || defaults[kind],
    status: 'open',
    day: game.dayNumber,
    candidates,
    voters,
    ballots: {},
    bavard: kind === 'elimination' ? game.powers.bavardPending ?? null : null,
    ravenTargetId: kind === 'elimination' ? game.powers.ravenTarget : null,
    chiefIdAtOpen: game.chiefId,
    openedAt: Date.now(),
    closesAt: typeof opts.durationSec === 'number' && opts.durationSec > 0 ? Date.now() + opts.durationSec * 1000 : undefined,
    published: false,
  };
  addEvent(game, 'public', 'vote', `Le vote est ouvert : ${game.vote.label}.`);
}

export function castBallot(game: Game, playerId: string, targetId: string | null) {
  requireStatus(game, 'running');
  const v = game.vote;
  if (!v || v.status !== 'open') throw new GameError('Aucun vote n’est ouvert.');
  const p = getPlayer(game, playerId);
  if (!p.alive) throw new GameError('Les joueurs éliminés ne peuvent plus voter.');
  if (!v.voters.includes(p.id)) throw new GameError('Vous ne participez pas à ce vote.');
  if (v.ballots[p.id]) throw new GameError('Vous avez déjà voté pour ce tour.');
  if (!targetId) throw new GameError('Choisissez un joueur.');
  if (targetId === p.id) throw new GameError('Vous ne pouvez pas vous désigner vous-même.');
  if (!v.candidates.includes(targetId)) throw new GameError('Ce joueur ne peut pas être désigné.');
  if (!getPlayer(game, targetId).alive) throw new GameError('Ce joueur est éliminé.');
  v.ballots[p.id] = targetId;
}


export function tally(game: Game, v: VoteRecord): VoteResult {
  const entries = new Map<string, VoteResult['entries'][number]>();
  const notes: string[] = [];
  const abstentions: string[] = [];
  const entry = (id: string) => {
    if (!entries.has(id)) entries.set(id, { playerId: id, total: 0, details: [] });
    return entries.get(id)!;
  };
  const chief = v.chiefIdAtOpen;
  for (const voter of v.voters) {
    const vp = game.players.find((p) => p.id === voter);
    if (!vp || !vp.alive) continue;
    let target: string | undefined = v.ballots[voter];
    let note: string | undefined;
    if (v.bavard && v.bavard.targetVoterId === voter) {
      if (v.bavard.effect === 'annuler') {
        notes.push(`Le vote de ${vp.name} a été annulé par le Loup Bavard.`);
        if (target) { abstentions.push(voter); continue; }
      } else if (!v.bavard.redirectTo || !v.candidates.includes(v.bavard.redirectTo) || !game.players.find((p) => p.id === v.bavard!.redirectTo)?.alive) {
        notes.push(`Le vote de ${vp.name} a été annulé par le Loup Bavard (la personne visée ne peut plus être désignée).`);
        abstentions.push(voter);
        continue;
      } else {
        notes.push(`Le vote de ${vp.name} a été redirigé par le Loup Bavard vers ${nameOf(game, v.bavard.redirectTo)}.`);
        target = v.bavard.redirectTo;
        note = 'redirigé';
      }
    }
    if (!target) { abstentions.push(voter); continue; }
    const weight = v.kind !== 'chef' && voter === chief ? 2 : 1;
    const e = entry(target);
    e.total += weight;
    e.details.push({ from: voter, weight, note: weight === 2 ? (note ? `Chef, ${note}` : 'Chef du village') : note });
  }
  if (v.ravenTargetId && v.candidates.includes(v.ravenTargetId) && game.players.find((p) => p.id === v.ravenTargetId)?.alive) {
    const e = entry(v.ravenTargetId);
    e.total += 2;
    e.details.push({ from: 'corbeau', weight: 2, note: 'Malédiction du Corbeau' });
    notes.push(`${nameOf(game, v.ravenTargetId)} reçoit 2 voix supplémentaires (Corbeau).`);
  }
  const list = [...entries.values()].sort((a, b) => b.total - a.total);
  const max = list[0]?.total ?? 0;
  const leaders = max > 0 ? list.filter((e) => e.total === max).map((e) => e.playerId) : [];
  if (leaders.length > 1) notes.push('Égalité : le Maître du jeu tranche selon les règles de la table.');
  return { entries: list, abstentions, leaders, notes };
}

export function closeVote(game: Game) {
  requireStatus(game, 'running');
  const v = game.vote;
  if (!v || v.status !== 'open') throw new GameError('Aucun vote n’est ouvert.');
  v.status = 'closed';
  v.closedAt = Date.now();
  v.result = tally(game, v);
  if (v.kind === 'elimination' && v.ravenTargetId) game.powers.ravenTarget = null;
  if (v.kind === 'elimination' && v.bavard) game.powers.bavardPending = null;
  if (v.kind === 'elimination' && !game.firstEliminationVoteId) game.firstEliminationVoteId = v.id;
  game.votes.push(v);
  addEvent(game, 'public', 'vote', `Le vote est clos : ${v.label}.`);
  addEvent(
    game,
    'gm',
    'vote',
    `Résultat — ${v.result.entries.map((e) => `${nameOf(game, e.playerId)} : ${e.total}`).join(', ') || 'aucune voix'}.`,
  );
}

export function publishVote(game: Game) {
  const v = game.vote;
  if (!v || v.status !== 'closed' || !v.result) throw new GameError('Aucun résultat à publier.');
  v.published = true;
  addEvent(
    game,
    'public',
    'vote',
    `Résultat du vote : ${v.result.entries.map((e) => `${nameOf(game, e.playerId)} (${e.total})`).join(', ') || 'aucune voix'}.`,
  );
  // Un seul gagnant : l'issue s'applique d'elle-même. Égalité : le MJ tranche (resolveVoteTie).
  if (v.result.leaders.length === 1) applyVoteOutcome(game, v.result.leaders[0]);
}

function applyVoteOutcome(game: Game, playerId: string) {
  const v = game.vote!;
  if (v.appliedTo) return;
  const p = game.players.find((x) => x.id === playerId);
  if (!p?.alive) return;
  v.appliedTo = p.id;
  if (v.kind === 'elimination') eliminate(game, p.id, 'éliminé(e) par le vote du village', true, 'vote');
  else if (v.kind === 'chef') setChief(game, p.id);
}

/** Égalité : le Maître du jeu désigne le perdant / l'élu parmi les ex æquo. */
export function resolveVoteTie(game: Game, playerId: string) {
  const v = game.vote;
  if (!v || v.status !== 'closed' || !v.result) throw new GameError('Aucun vote à trancher.');
  if (v.appliedTo) throw new GameError('Ce vote est déjà tranché.');
  if (!v.result.leaders.includes(playerId)) throw new GameError('Choisissez parmi les ex æquo.');
  applyVoteOutcome(game, playerId);
}

export function dismissVote(game: Game) {
  const v = game.vote;
  if (!v) return;
  if (v.status === 'open') {
    addEvent(game, 'public', 'vote', 'Le vote a été annulé par le Maître du jeu.');
  }
  game.vote = null;
}

/* ------------------------------------------------------------------ */
/* Communication                                                       */
/* ------------------------------------------------------------------ */

export function sendWhisper(game: Game, playerId: string, text: string) {
  const p = getPlayer(game, playerId);
  const clean = String(text ?? '').trim().slice(0, 500);
  if (!clean) throw new GameError('Message vide.');
  p.whispers.push({ id: uid(), at: Date.now(), text: clean });
  addEvent(game, 'gm', 'whisper', `Murmure à ${p.name} : « ${clean} »`);
}

export function announce(game: Game, text: string) {
  const clean = String(text ?? '').trim().slice(0, 500);
  if (!clean) throw new GameError('Annonce vide.');
  addEvent(game, 'public', 'announce', clean);
}

export function wolfChatSend(game: Game, playerId: string, text: string) {
  requireStatus(game, 'running');
  if (game.phase !== 'night') throw new GameError('Le chat de la meute n’est ouvert que la nuit.');
  const p = getPlayer(game, playerId);
  if (!p.alive || !isPackMember(game, p)) throw new GameError('Accès refusé.');
  const clean = String(text ?? '').trim().slice(0, 400);
  if (!clean) return;
  game.wolfChat.push({ id: uid(), at: Date.now(), fromId: p.id, fromName: p.name, text: clean, night: game.nightNumber });
  if (game.wolfChat.length > 1000) game.wolfChat.splice(0, game.wolfChat.length - 1000);
}

/* ------------------------------------------------------------------ */
/* Fin de partie & archives                                            */
/* ------------------------------------------------------------------ */

/** Camp effectif d'un joueur pour la victoire. */
export function winnerCampOf(game: Game, p: PlayerState): 'village' | 'loups' | 'loupBlanc' | 'flute' | 'ange' {
  if (p.roleId === 'loupBlanc') return 'loupBlanc';
  if (p.roleId === 'joueurDeFlute') return 'flute';
  if (p.roleId === 'angeDechu') return 'ange';
  return isPackMember(game, p) ? 'loups' : 'village';
}

/** Joueurs gagnants proposés pour un ensemble de camps (le MJ peut ajuster). */
export function winnersFor(game: Game, camps: WinnerCamp[]): string[] {
  const ids = new Set<string>();
  for (const p of game.players) {
    const c = winnerCampOf(game, p);
    if (camps.includes(c as WinnerCamp)) ids.add(p.id);
  }
  if (camps.includes('amoureux') && game.powers.lovers) game.powers.lovers.forEach((id) => ids.add(id));
  return [...ids];
}

/**
 * Vérifie les conditions de victoire après chaque événement.
 * C'est une aide : le Maître du jeu confirme toujours la fin de partie.
 */
export function victoryChecks(game: Game): VictoryCheck[] {
  if (game.status !== 'running') return [];
  const alive = alivePlayers(game);
  const camp = (c: string) => alive.filter((p) => winnerCampOf(game, p) === c);
  const wolves = camp('loups');
  const white = camp('loupBlanc');
  const piper = camp('flute');
  const nonWolves = alive.filter((p) => !['loups', 'loupBlanc'].includes(winnerCampOf(game, p)));
  const checks: VictoryCheck[] = [];
  const present = (r: RoleId) => game.players.some((p) => p.roleId === r || p.originalRoleId === r);

  checks.push({
    id: 'village',
    label: 'Villageois',
    met: wolves.length === 0 && white.length === 0 && piper.length === 0,
    detail: `${wolves.length + white.length} loup(s) en vie${piper.length ? ', Joueur de Flûte en vie' : ''}`,
  });
  checks.push({
    id: 'loups',
    label: 'Loups-Garous',
    met: wolves.length > 0 && nonWolves.length === 0 && white.length === 0,
    detail: `${wolves.length} loup(s) contre ${nonWolves.length + white.length} autre(s)${wolves.length >= nonWolves.length + white.length && wolves.length > 0 ? ' — les loups sont majoritaires' : ''}`,
  });
  if (present('loupBlanc'))
    checks.push({ id: 'loupBlanc', label: 'Loup Blanc', met: white.length === 1 && alive.length === 1, detail: white.length ? `${alive.length} survivant(s)` : 'éliminé' });
  if (present('joueurDeFlute')) {
    const others = piper.length ? alive.filter((p) => p.id !== piper[0].id) : [];
    const charmed = others.filter((p) => p.charmed).length;
    checks.push({ id: 'flute', label: 'Joueur de Flûte', met: piper.length > 0 && others.length > 0 && charmed === others.length, detail: piper.length ? `${charmed} / ${others.length} enchanté(s)` : 'éliminé' });
  }
  if (present('angeDechu')) {
    const ange = game.players.find((p) => p.roleId === 'angeDechu');
    const choice = game.powers.angeChoice;
    checks.push({
      id: 'ange',
      label: 'Ange Déchu',
      met: choice === 'elimination' ? !!game.powers.angeWon : false,
      detail:
        choice === 'elimination'
          ? game.powers.angeWon ? 'éliminé au premier vote : victoire' : 'doit être éliminé au premier vote du village'
          : choice === 'survie'
            ? ange?.alive ? 'en vie : gagne s’il survit jusqu’à la fin' : 'éliminé : condition ratée'
            : 'n’a pas encore choisi sa voie',
    });
  }
  const lovers = game.powers.lovers;
  if (lovers) {
    const both = lovers.every((id) => alive.some((p) => p.id === id));
    checks.push({ id: 'amoureux', label: 'Amoureux', met: both && alive.length === 2, detail: both ? 'les deux amoureux sont en vie' : 'un amoureux est mort' });
  }
  return checks;
}

/**
 * Fin de partie automatique (règles de la table) :
 *  - tous les loups sont morts → victoire des Villageois ;
 *  - les loups sont plus nombreux que les villageois (ou ceux-ci sont tous morts) → victoire des Loups.
 * Tant qu'un mercenaire (Loup Blanc, Joueur de Flûte, Ange Déchu) est en vie, la partie continue.
 * On attend aussi que les conséquences en cours (Chasseur, chagrin…) soient résolues.
 */
export function autoVictory(game: Game): boolean {
  if (game.status !== 'running' || game.pendingTriggers.some((t) => t.type !== 'chief')) return false;
  const alive = alivePlayers(game);
  const campOf = (p: PlayerState) => winnerCampOf(game, p);
  const ange = game.players.find((p) => campOf(p) === 'ange');
  /** Termine la partie ; l'Ange Déchu (voie « survie ») encore en vie gagne aussi. */
  const finish = (winner: string, ids: string[]) => {
    const all = new Set(ids);
    if (ange?.alive && game.powers.angeChoice === 'survie') all.add(ange.id);
    endGame(game, winner, false, [...all]);
    return true;
  };

  // Ange Déchu éliminé au premier vote : il gagne seul, la partie s'arrête.
  if (game.powers.angeWon && ange) { endGame(game, 'L’Ange Déchu', false, [ange.id]); return true; }
  if (alive.length === 0) { endGame(game, 'Personne', false, []); return true; }

  // Joueur de Flûte : dès que tous les autres joueurs vivants sont ensorcelés, il gagne seul.
  const piper = alive.find((p) => campOf(p) === 'flute');
  const others = piper ? alive.filter((p) => p.id !== piper.id) : [];
  if (piper && others.length > 0 && others.every((p) => p.charmed)) return finish('Le Joueur de Flûte', [piper.id]);

  // Loup Blanc : il gagne s'il est le dernier survivant.
  if (alive.length === 1 && campOf(alive[0]) === 'loupBlanc') return finish('Le Loup Blanc', [alive[0].id]);

  // Couple d'amoureux mixte (loup + villageois) : il gagne s'il reste seul ; sinon il joue pour lui-même.
  const l = game.powers.lovers;
  const loversAlive = !!l && l.every((id) => alive.some((p) => p.id === id));
  if (loversAlive && new Set(l!.map((id) => campOf(getPlayer(game, id)))).size > 1) {
    if (alive.length === 2) return finish('Les Amoureux', winnersFor(game, ['amoureux']));
    return false;
  }

  const wolves = alive.filter((p) => campOf(p) === 'loups').length;
  const white = alive.some((p) => campOf(p) === 'loupBlanc');
  const rest = alive.length - wolves - (white ? 1 : 0);
  // Village : plus aucun loup (meute, Loup Blanc) ni Joueur de Flûte.
  if (wolves === 0 && !white && !piper) return finish('Les Villageois', winnersFor(game, ['village']));
  // Meute : majoritaire, une fois morts le Loup Blanc et le Joueur de Flûte (qui peuvent encore gagner seuls).
  if (wolves > 0 && !white && !piper && wolves > rest) return finish('Les Loups-Garous', winnersFor(game, ['loups']));
  return false;
}

export function endGame(game: Game, winner: string, cancelled = false, winnerIds: string[] = []) {
  requireStatus(game, 'lobby', 'running');
  game.status = cancelled ? 'cancelled' : 'ended';
  game.phase = 'ended';
  game.endedAt = Date.now();
  game.winner = cancelled ? null : String(winner ?? '').trim().slice(0, 120) || 'Non précisé';
  game.winnerIds = cancelled ? [] : (Array.isArray(winnerIds) ? winnerIds : []).filter((id) => game.players.some((p) => p.id === id));
  if (game.vote?.status === 'open') dismissVote(game);
  game.pendingTriggers = [];
  for (const p of game.players) if (!cancelled) p.revealed = true;
  const names = game.winnerIds.map((id) => nameOf(game, id)).join(', ');
  addEvent(game, 'public', 'end', cancelled ? 'La partie a été annulée.' : `Fin de la partie. Victoire : ${game.winner}${names ? ` (${names})` : ''}.`);
}

/**
 * Revanche : la même table repart en salle d'attente avec les mêmes joueurs
 * (mêmes places, mêmes jetons : personne n'a à rescanner le code).
 * La partie précédente est déjà archivée ; la nouvelle reçoit un nouvel identifiant.
 */
export function rematch(game: Game) {
  if (game.status !== 'ended' && game.status !== 'cancelled') throw new GameError('La partie n’est pas terminée.');
  const fresh = createGame(game.gmId, game.gmName, game.code, Math.max(MIN_PLAYERS, game.players.length));
  const players: PlayerInternal[] = game.players.map((p) => ({
    ...p,
    alive: true,
    roleId: null,
    originalRoleId: null,
    revealed: false,
    charmed: false,
    deathReason: undefined,
    deathRound: undefined,
    whispers: [],
  }));
  const composition = game.composition;
  const piper = game.settings.piperCharmCount;
  delete game.lastVerdict;
  delete game.endedAt;
  delete game.firstEliminationVoteId;
  Object.assign(game, fresh, { players, composition, settings: { ...fresh.settings, piperCharmCount: piper } });
  addEvent(game, 'public', 'system', 'Revanche ! Les mêmes villageois se rassoient autour de la table.');
}

export function toArchive(game: Game): ArchivedGame {
  return {
    id: game.id,
    code: game.code,
    gmName: game.gmName,
    createdAt: game.createdAt,
    endedAt: game.endedAt ?? Date.now(),
    status: game.status === 'cancelled' ? 'cancelled' : 'ended',
    winner: game.winner,
    composition: game.composition,
    settings: game.settings,
    players: game.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      roleId: p.roleId,
      originalRoleId: p.originalRoleId,
      alive: p.alive,
      winner: game.winnerIds.includes(p.id),
      deathReason: p.deathReason,
      deathRound: p.deathRound,
    })),
    events: game.events,
    votes: game.votes,
  };
}
